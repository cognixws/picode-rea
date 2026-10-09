import { analysisProviderIdSchema, analysisProviderSelectorSchema, } from "../../contracts/providerSelection.js";
import { AnalysisCancelledError } from "../../domain/analysisErrorCore.js";
import { ProviderSelectionError, } from "../../domain/providerSelectionError.js";
import { jsonObjectSchema } from "../../domain/jsonValue.js";
import { err, ok } from "../../domain/result.js";
import { evaluateAnalysisProviderCandidate, } from "./AnalysisProviderEvaluation.js";
/**
 * Discover and select overlapping deep providers without starting their clients.
 * Registration order never affects selection or caller-visible output.
 */
export class AnalysisProviderRegistry {
    #providers;
    #byId;
    #declaredOperations;
    #defaultSelector;
    constructor(providers, defaultSelector = "auto") {
        this.#defaultSelector =
            analysisProviderSelectorSchema.parse(defaultSelector);
        const byId = new Map();
        const declaredOperations = new Set();
        for (const provider of providers) {
            const identity = provider.identity();
            if (!analysisProviderIdSchema.safeParse(identity.id).success)
                throw new TypeError(`Invalid analysis provider ID: ${identity.id}`);
            if (byId.has(identity.id))
                throw new TypeError(`Duplicate analysis provider ID: ${identity.id}`);
            const providerOperations = new Set();
            for (const capability of provider.capabilities()) {
                if (capability.provider.id !== identity.id ||
                    capability.provider.name !== identity.name ||
                    capability.provider.version !== identity.version)
                    throw new TypeError(`Provider ${identity.id} published mismatched capability provenance for ${capability.operation}`);
                if (providerOperations.has(capability.operation))
                    throw new TypeError(`Provider ${identity.id} declares operation ${capability.operation} more than once`);
                providerOperations.add(capability.operation);
                declaredOperations.add(capability.operation);
            }
            byId.set(identity.id, provider);
        }
        this.#providers = Object.freeze([...providers].sort((left, right) => left.identity().id.localeCompare(right.identity().id)));
        this.#byId = byId;
        this.#declaredOperations = Object.freeze([...declaredOperations].sort((left, right) => left.localeCompare(right)));
    }
    /** Return the configured default without interpreting it as priority. */
    defaultSelector() {
        return this.#defaultSelector;
    }
    /** List configured candidate identities in canonical provider-ID order. */
    identities() {
        return this.#providers.map((provider) => structuredClone(provider.identity()));
    }
    /** List the unique deep-operation declarations without probing candidates. */
    declaredOperations() {
        return [...this.#declaredOperations];
    }
    /** Discover candidates for status without resolving profiles or starting clients. */
    candidates(target) {
        return this.#providers.map((provider) => candidateStatus(provider, target));
    }
    /** Select one whole deep-operation family for a parsed target. */
    async select(target, requestedSelector, options = {}) {
        if (signalIsAborted(options.signal))
            return err(new AnalysisCancelledError("open_binary"));
        const parsedRequest = requestedSelector === undefined
            ? undefined
            : analysisProviderSelectorSchema.safeParse(requestedSelector);
        if (parsedRequest !== undefined && !parsedRequest.success)
            return err(selectionError("invalid_options", typeof requestedSelector === "string"
                ? requestedSelector
                : "<invalid>", this.candidates(target)));
        const request = parsedRequest?.data;
        const selector = request ?? this.#defaultSelector;
        const baseline = this.candidates(target);
        if (signalIsAborted(options.signal))
            return err(new AnalysisCancelledError("open_binary"));
        if (request === undefined &&
            selector !== "auto" &&
            baseline.length > 0 &&
            baseline.every(({ targetSupport }) => targetSupport.status === "unsupported"))
            return ok({
                requestedProviderId: selector,
                binding: null,
                candidates: baseline,
            });
        if (selector !== "auto")
            return this.#selectConcrete({ target, baseline, signal: options.signal }, selector, request === undefined ? "environment" : "request");
        return this.#selectAutomatically({
            target,
            baseline,
            signal: options.signal,
        });
    }
    /** Explain why a deep operation is unavailable on an unbound target. */
    unboundOperationError(operation, selection) {
        const reason = selection.candidates.length > 0 &&
            selection.candidates.every(({ targetSupport }) => targetSupport.status === "unsupported")
            ? "target_unsupported"
            : "provider_unavailable";
        return selectionError(reason, selection.requestedProviderId, selection.candidates, operation);
    }
    async #selectConcrete(context, providerId, source) {
        const { baseline, signal, target } = context;
        const provider = this.#byId.get(providerId);
        if (provider === undefined)
            return err(selectionError("unknown_provider", providerId, baseline));
        const initial = baseline.find(({ provider: identity }) => identity.id === providerId);
        if (initial === undefined)
            throw new TypeError("Registered provider is absent from discovery output");
        if (initial.targetSupport.status !== "supported")
            return err(selectionError("target_unsupported", providerId, baseline));
        if (initial.availability.status === "unavailable")
            return err(selectionError("provider_unavailable", providerId, baseline));
        const evaluation = await evaluateAnalysisProviderCandidate(provider, initial, target, signal);
        if (!evaluation.ok)
            return evaluation;
        const evaluated = evaluation.value;
        if (evaluated.profileError !== undefined)
            return err(evaluated.profileError);
        const statuses = replaceCandidate(baseline, evaluated.status);
        if (evaluated.profile === undefined ||
            evaluated.compatibility === undefined)
            return err(selectionError("provider_unavailable", providerId, statuses));
        return ok(selectedResult(providerId, source, {
            ...evaluated,
            profile: evaluated.profile,
            compatibility: evaluated.compatibility,
        }, statuses));
    }
    async #selectAutomatically(context) {
        const { baseline, signal, target } = context;
        const results = await Promise.all(this.#providers.map(async (provider) => {
            const status = baseline.find(({ provider: identity }) => identity.id === provider.identity().id);
            if (status === undefined)
                throw new TypeError("Registered provider is absent from discovery output");
            return status.availability.status === "available" &&
                status.targetSupport.status === "supported"
                ? evaluateAnalysisProviderCandidate(provider, status, target, signal)
                : ok({
                    candidate: provider,
                    status,
                });
        }));
        const cancelled = results.find((result) => !result.ok);
        if (cancelled !== undefined && !cancelled.ok)
            return cancelled;
        const evaluations = results.map((result) => {
            if (!result.ok)
                throw new TypeError("Cancelled candidate evaluation disappeared");
            return result.value;
        });
        const statuses = evaluations.map(({ status }) => status);
        const usable = evaluations.filter((evaluation) => evaluation.profile !== undefined &&
            evaluation.compatibility !== undefined);
        if (usable.length === 0)
            return ok({
                requestedProviderId: "auto",
                binding: null,
                candidates: statuses,
            });
        if (usable.length > 1)
            return err(selectionError("ambiguous", "auto", statuses));
        const selected = usable[0];
        if (selected === undefined)
            throw new TypeError("Usable provider selection disappeared");
        return ok(selectedResult("auto", "auto-single-candidate", selected, statuses));
    }
}
const candidateStatus = (provider, target) => ({
    provider: structuredClone(provider.identity()),
    availability: cloneAvailability(provider.inspectAvailability()),
    targetSupport: target === undefined
        ? {
            status: "unknown",
            code: null,
            reason: "No target is open.",
            diagnostics: {},
        }
        : cloneTargetSupport(provider.inspectTargetSupport(target)),
    selected: false,
    capabilities: provider
        .capabilities()
        .map((capability) => structuredClone(capability)),
});
const signalIsAborted = (signal) => signal?.aborted === true;
const selectedResult = (requestedProviderId, source, evaluated, statuses) => {
    const selectedStatus = {
        ...evaluated.status,
        provider: structuredClone(evaluated.profile.provider),
        selected: true,
    };
    return {
        requestedProviderId,
        binding: {
            provider: evaluated.candidate,
            identity: structuredClone(evaluated.profile.provider),
            selectionSource: source,
            profile: structuredClone(evaluated.profile),
            compatibility: structuredClone(evaluated.compatibility),
        },
        candidates: replaceCandidate(statuses, selectedStatus),
    };
};
const replaceCandidate = (statuses, replacement) => statuses.map((status) => status.provider.id === replacement.provider.id ? replacement : status);
const selectionError = (reason, requestedProviderId, candidates, operation = "open_binary") => new ProviderSelectionError({
    operation,
    reason,
    requestedProviderId,
    candidateIds: candidates.map(({ provider }) => provider.id),
    rejections: candidateRejections(candidates),
});
const candidateRejections = (candidates) => candidates.flatMap((candidate) => [
    ...(candidate.availability.status === "unavailable"
        ? [candidate.availability]
        : []),
    ...(candidate.targetSupport.status === "unsupported"
        ? [candidate.targetSupport]
        : []),
].map((rejection) => ({
    providerId: candidate.provider.id,
    code: rejection.code,
    reason: rejection.reason,
    diagnostics: structuredClone(rejection.diagnostics),
})));
const cloneAvailability = (availability) => ({
    ...availability,
    diagnostics: jsonObjectSchema.parse(availability.diagnostics),
});
const cloneTargetSupport = (support) => ({
    ...support,
    diagnostics: jsonObjectSchema.parse(support.diagnostics),
});
