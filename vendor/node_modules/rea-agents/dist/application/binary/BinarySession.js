import { randomUUID } from "node:crypto";
import { analysisProfilesEqual, } from "../../domain/analysisProfile.js";
import { AnalysisCancelledError } from "../../domain/analysisErrorCore.js";
import {} from "../../domain/analysisErrorBase.js";
import { err, ok } from "../../domain/result.js";
import { createEvidence } from "../../domain/evidence.js";
import { OFFICIAL_TOOL_CONTRACTS } from "../../contracts/officialToolContracts.js";
import { ENHANCED_TOOL_CONTRACTS } from "../../contracts/enhancedToolContracts.js";
import { writeAnalysisSnapshot } from "./AnalysisSnapshotFiles.js";
import { SessionProviderRouter, } from "./SessionProviderRouter.js";
import { InvestigationRecords } from "../investigation/InvestigationRecords.js";
import { BinarySessionRecords } from "./BinarySessionRecords.js";
import { binarySessionStatus } from "./BinarySessionStatus.js";
import { resolveSessionOpen, resolveSessionTarget, validateResolvedSessionTarget, } from "./BinarySessionOpen.js";
import { bindExecutionTarget, commitExecutionProfile, prepareSessionExecution, } from "./BinarySessionExecution.js";
import { closeAnalysisClient } from "./AnalysisClientCleanup.js";
const OFFICIAL_OPERATIONS = new Set(OFFICIAL_TOOL_CONTRACTS.map(({ name }) => name));
const ENHANCED_OPERATIONS = new Set(ENHANCED_TOOL_CONTRACTS.map(({ name }) => name));
/**
 * Owns the single active target shared by CLI and MCP adapters.
 *
 * Target transitions are serialized because switching targets tears down the
 * active provider client. A failed switch recreates the previous target instead
 * of retaining a client whose resources were already shut down.
 */
export class BinarySession extends BinarySessionRecords {
    #active;
    #transition = Promise.resolve();
    #transitionGeneration = 0;
    #calls = new Map();
    #providerRouter;
    #runtimeUnavailability = new Map();
    #availabilityListeners = new Set();
    constructor(providerRouter, records = new InvestigationRecords()) {
        super(records);
        this.#providerRouter = providerRouter;
    }
    /** Identify the provider producing evidence for this session. */
    providerIdentity(operation) {
        const route = this.#currentRoute();
        let selected = route.identity;
        if (operation !== undefined) {
            const exact = route.capabilities?.get(operation)?.provider;
            if (exact !== undefined)
                selected = exact;
            else if (ENHANCED_OPERATIONS.has(operation)) {
                const providers = new Map();
                for (const descriptor of route.capabilities?.values() ?? [])
                    if (descriptor.available &&
                        OFFICIAL_OPERATIONS.has(descriptor.operation))
                        providers.set(descriptor.provider.id, descriptor.provider);
                if (providers.size === 1) {
                    const provider = providers.values().next().value;
                    if (provider !== undefined)
                        selected = provider;
                }
            }
        }
        const profile = this.#active?.profile;
        return structuredClone(profile !== null &&
            profile !== undefined &&
            profile.provider.id === selected.id
            ? profile.provider
            : selected);
    }
    /** External live state cannot be replayed by a direct or composed CLI workflow. */
    allowsSnapshotReplay(operation) {
        const capabilities = this.#active?.route.capabilities;
        const descriptor = capabilities?.get(operation);
        if (descriptor !== undefined)
            return descriptor.cachePolicy !== "live";
        return ![...(capabilities?.values() ?? [])].some(({ cachePolicy }) => cachePolicy === "live");
    }
    /** Return the selected immutable profile, optionally scoped to an operation. */
    analysisProfile(operation) {
        const profile = this.#active?.profile;
        if (profile === null || profile === undefined)
            return undefined;
        if (operation !== undefined &&
            this.providerIdentity(operation).id !== profile.provider.id)
            return undefined;
        return structuredClone(profile);
    }
    /** Return opaque adapter metadata retained for legacy open_binary output. */
    openCompatibility() {
        return structuredClone(this.#active?.compatibility ?? {});
    }
    /** Observe runtime provider-health changes that affect discovery metadata. */
    onAvailabilityChanged(listener) {
        this.#availabilityListeners.add(listener);
        return () => this.#availabilityListeners.delete(listener);
    }
    /** Resolve a target and provider profile without creating a provider client. */
    previewTarget(target, options = {}) {
        if (isAborted(options.signal))
            return Promise.resolve(err(new AnalysisCancelledError("open_binary")));
        return resolveSessionTarget({
            router: this.#providerRouter,
            current: this.#active,
            target,
            options,
            stagedSnapshotMatches: (target, profile) => this.matchesSnapshot(target, profile),
        }).then((resolved) => isAborted(options.signal)
            ? err(new AnalysisCancelledError("open_binary"))
            : resolved);
    }
    /**
     * Open or switch targets after draining calls against the current target.
     * Returns the switch failure even if best-effort restoration also fails.
     */
    open(path, options = {}) {
        return this.#open(() => resolveSessionOpen({
            router: this.#providerRouter,
            current: this.#active,
            path,
            options,
            stagedSnapshotMatches: (target, profile) => this.matchesSnapshot(target, profile),
        }), options);
    }
    /** Open a previewed target without repeating parsing or provider profile discovery. */
    openResolvedTarget(resolved, options = {}) {
        return this.#open(() => Promise.resolve(validateResolvedSessionTarget({
            ...resolved,
            current: this.#active,
            options,
            stagedSnapshotMatches: (target, profile) => this.matchesSnapshot(target, profile),
        })), options);
    }
    #open(resolve, options) {
        return this.#serialize(async (admittedThrough) => {
            if (isAborted(options.signal))
                return err(new AnalysisCancelledError("open_binary"));
            const resolved = await resolve();
            if (!resolved.ok)
                return resolved;
            const { target, route, sameTarget } = resolved.value;
            const { profile, compatibility } = route;
            if (isAborted(options.signal))
                return err(new AnalysisCancelledError("open_binary"));
            const activeProfile = this.#active?.profile;
            const sameProfile = activeProfile === null || activeProfile === undefined
                ? profile === null
                : profile !== null && analysisProfilesEqual(activeProfile, profile);
            await this.#drainCalls(admittedThrough);
            if (isAborted(options.signal))
                return err(new AnalysisCancelledError("open_binary"));
            if (sameTarget && sameProfile) {
                if (options.snapshot !== undefined) {
                    const imported = this.importAnalysisSnapshot(options.snapshot);
                    if (!imported.ok)
                        return imported;
                }
                return ok(target);
            }
            const previous = this.#active;
            this.#active = undefined;
            if (previous !== undefined) {
                const closed = await closeAnalysisClient(previous.client, previous.route.identity.id);
                if (!closed.ok) {
                    this.clearSessionRecords();
                    this.#clearRuntimeAvailability();
                    return closed;
                }
            }
            const runId = randomUUID();
            const client = route.createClient(target, { runId });
            const started = await client.execute("health", {}, options);
            if (!started.ok) {
                await client.close();
                await this.#restore(previous);
                return started;
            }
            if (isAborted(options.signal)) {
                await client.close();
                await this.#restore(previous);
                return err(new AnalysisCancelledError("open_binary"));
            }
            this.#active = {
                target,
                client,
                profile,
                compatibility: structuredClone(compatibility),
                route,
                runId,
            };
            this.#clearRuntimeAvailability();
            this.resetSnapshotInvalidation();
            if (options.snapshot === undefined) {
                if (profile === null)
                    this.clearSnapshot();
                else
                    this.selectSnapshot(target, profile);
            }
            if (options.snapshot !== undefined) {
                const imported = this.importAnalysisSnapshot(options.snapshot);
                if (!imported.ok) {
                    this.#active = undefined;
                    await client.close();
                    await this.#restore(previous);
                    return imported;
                }
            }
            return ok(target);
        });
    }
    /** Close the active target, if any. */
    close(options = {}) {
        return this.#serialize(async (admittedThrough) => {
            await this.#drainCalls(admittedThrough);
            return this.#closeActive(options);
        });
    }
    /** Drain earlier requests, save an immutable snapshot, and close under one lifecycle lock. */
    closeWithSnapshot(path, overwrite, options = {}) {
        return this.#serialize(async (admittedThrough) => {
            await this.#drainCalls(admittedThrough);
            const snapshot = this.exportAnalysisSnapshot();
            if (!snapshot.ok)
                return snapshot;
            const written = await writeAnalysisSnapshot(snapshot.value, path, overwrite);
            if (!written.ok)
                return written;
            const closed = await this.#closeActive(options);
            return closed.ok
                ? ok({ ...written.value, entries: snapshot.value.entries.length })
                : closed;
        });
    }
    async #closeActive(options) {
        const previous = this.#active;
        this.#active = undefined;
        const closed = previous === undefined
            ? ok(null)
            : await closeAnalysisClient(previous.client, previous.route.identity.id, {
                ...(options.progress === undefined
                    ? {}
                    : { progress: options.progress }),
                ...(options.retainProviderDocuments === true
                    ? { retainDocument: true }
                    : {}),
            });
        this.clearSessionRecords();
        this.#clearRuntimeAvailability();
        return closed;
    }
    /** Describe the active binary session. */
    status() {
        return binarySessionStatus({
            target: this.#active?.target,
            route: this.#currentRoute(),
            router: this.#providerRouter,
            runtimeUnavailability: this.#runtimeUnavailability,
            runId: this.#active?.runId,
            runtimeLineageSnapshots: this.#active?.client.runtimeLineageSnapshots?.() ?? [],
            requestActivitySnapshots: this.#active?.client.requestActivitySnapshots?.() ?? [],
            providerOperationHealth: this.#active?.client.operationHealthSnapshot?.() ?? null,
        });
    }
    /** Return the immutable artifact identity captured before its provider started. */
    activeTarget() {
        return this.#active === undefined
            ? undefined
            : structuredClone(this.#active.target);
    }
    activeAnalysisBinding() {
        return this.#active;
    }
    /**
     * Invoke a provider operation against the active target.
     * Calls may overlap, but a pending target transition prevents new calls from
     * entering until the transition has settled.
     */
    execute(name, arguments_, options) {
        const generation = this.#transitionGeneration;
        const call = this.#execute(name, arguments_, options, this.#transition);
        this.#calls.set(call, generation);
        return call.finally(() => this.#calls.delete(call));
    }
    async #execute(name, arguments_, options, transition) {
        const transitioned = await this.#waitForTransition(name, options?.signal, transition);
        if (!transitioned.ok)
            return transitioned;
        const prepared = prepareSessionExecution({
            active: this.#active,
            operation: name,
            parameters: arguments_,
            unboundOperationError: (operation, route) => this.#providerRouter.unboundOperationError(operation, route),
            lookupSnapshot: (target, profile, operation, parameters) => operation === "decode_interface_builder" ||
                operation === "inspect_asset_catalog" ||
                operation === "inspect_keyed_archive" ||
                operation === "trace_dylib_resolution"
                ? undefined
                : this.lookupSnapshot(target, profile, operation, parameters),
        });
        if (!prepared.ok)
            return prepared;
        const { active, capability, profile, cacheable, cached } = prepared.value;
        if (cached !== undefined)
            return ok(cached);
        const call = active.client.execute(name, arguments_, options);
        const result = await call;
        const profiled = bindExecutionTarget(commitExecutionProfile(name, result, profile), name, active.target);
        this.#observeRuntimeAvailability(name, profiled);
        if (profiled.ok &&
            cacheable &&
            profile !== undefined &&
            name !== "decode_interface_builder" &&
            name !== "inspect_asset_catalog" &&
            name !== "inspect_keyed_archive" &&
            name !== "trace_dylib_resolution") {
            const evidence = createEvidence(profiled.value.subject ?? active.target, profiled.value.provider, {
                operation: name,
                parameters: arguments_,
                result: profiled.value.result,
                analysisProfile: profile,
                rawResult: profiled.value.rawResult,
                limitations: profiled.value.limitations,
                locations: profiled.value.locations,
            });
            const recorded = this.recordEvidence(evidence);
            if (!recorded.ok)
                return recorded;
            this.recordSnapshot({
                target: active.target,
                profile,
                operation: name,
                parameters: arguments_,
                execution: profiled.value,
            });
        }
        else if (profiled.ok && capability?.effects.mutatesArtifact === true) {
            this.invalidateSnapshot();
        }
        return profiled;
    }
    #observeRuntimeAvailability(operation, result) {
        if (result.ok) {
            if (this.#markRuntimeAvailable(operation))
                this.#emitAvailabilityChanged();
            return;
        }
        if (result.error._tag === "AnalysisCapabilityUnavailableError") {
            if (this.#markRuntimeUnavailable(operation, result.error.message))
                this.#emitAvailabilityChanged();
            return;
        }
        if ([
            "ProviderAdapterError",
            "HopperProcessError",
            "HopperStartError",
        ].includes(result.error._tag)) {
            const capabilities = this.#active?.route.capabilities;
            const providerId = capabilities?.get(operation)?.provider.id;
            let changed = false;
            for (const descriptor of capabilities?.values() ?? [])
                if (providerId !== undefined && descriptor.provider.id === providerId)
                    changed =
                        this.#markRuntimeUnavailable(descriptor.operation, `${result.error._tag}: ${result.error.message}`) || changed;
            if (changed)
                this.#emitAvailabilityChanged();
        }
    }
    #markRuntimeAvailable(operation) {
        return this.#runtimeUnavailability.delete(operation);
    }
    #markRuntimeUnavailable(operation, reason) {
        const current = this.#runtimeUnavailability.get(operation);
        if (current?.reason === reason)
            return false;
        this.#runtimeUnavailability.set(operation, { reason });
        return true;
    }
    #clearRuntimeAvailability() {
        if (this.#runtimeUnavailability.size === 0)
            return;
        this.#runtimeUnavailability.clear();
        this.#emitAvailabilityChanged();
    }
    #emitAvailabilityChanged() {
        for (const listener of this.#availabilityListeners) {
            try {
                const notification = listener();
                if (notification !== undefined) {
                    // best-effort cleanup: async observer notifications must not reject
                    // unhandled; state transitions and other listeners continue.
                    void notification.catch(() => undefined);
                }
            }
            catch (cause) {
                // External observers are best-effort notifications. Contain only the
                // callback failure so state transitions and other listeners continue.
                void cause;
            }
        }
    }
    #currentRoute() {
        return this.#active?.route ?? this.#providerRouter.initialRoute();
    }
    #serialize(operation) {
        // Later calls wait for this transition and must not be included in its drain.
        const admittedThrough = this.#transitionGeneration++;
        const result = this.#transition.then(() => operation(admittedThrough), () => operation(admittedThrough));
        this.#transition = result.then(() => undefined, () => undefined);
        return result;
    }
    async #drainCalls(admittedThrough) {
        await Promise.allSettled([...this.#calls]
            .filter(([, generation]) => generation <= admittedThrough)
            .map(([call]) => call));
    }
    async #restore(previous) {
        if (previous === undefined)
            return;
        const runId = randomUUID();
        const client = previous.route.createClient(previous.target, { runId });
        const started = await client.execute("health", {});
        if (started.ok)
            this.#active = {
                target: previous.target,
                client,
                profile: previous.profile,
                compatibility: previous.compatibility,
                route: previous.route,
                runId,
            };
        else
            await client.close();
    }
    async #waitForTransition(operation, signal, transition) {
        if (signal?.aborted === true)
            return err(new AnalysisCancelledError(operation));
        if (signal === undefined) {
            await transition;
            return ok(undefined);
        }
        return new Promise((resolve) => {
            const onAbort = () => {
                resolve(err(new AnalysisCancelledError(operation)));
            };
            signal.addEventListener("abort", onAbort, { once: true });
            transition.then(() => {
                signal.removeEventListener("abort", onAbort);
                resolve(signal.aborted
                    ? err(new AnalysisCancelledError(operation))
                    : ok(undefined));
            }, () => {
                signal.removeEventListener("abort", onAbort);
                resolve(signal.aborted
                    ? err(new AnalysisCancelledError(operation))
                    : ok(undefined));
            });
        });
    }
}
const isAborted = (signal) => signal?.aborted === true;
