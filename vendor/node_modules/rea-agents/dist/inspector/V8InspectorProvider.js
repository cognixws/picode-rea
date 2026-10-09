import { javascriptRuntimeObservationSchema, javascriptRuntimeTargetListSchema, } from "../domain/javascript/javascriptRuntimeObservation.js";
import { AnalysisError } from "../domain/analysisErrorBase.js";
import { BrowserObservationError } from "../domain/browserObservationError.js";
import { ProviderAdapterError } from "../domain/providerAdapterError.js";
import {} from "../domain/browserObservationErrors.js";
import { err, ok } from "../domain/result.js";
import { numberValue, recordValue, cdpStringValue, delayWithCancellation, } from "../browser/CdpCaptureValues.js";
import { CdpConnection } from "../browser/CdpConnection.js";
import { authorizeRuntimeTargetLocation, inspectorExclusionKey, } from "./JavaScriptRuntimeScope.js";
import { createInspectorExclusionCounts, describeInspectorTargetLimitations, finalizeInspectorCapture, } from "./V8InspectorCaptureProjection.js";
import { discoverV8Inspector, } from "./V8InspectorEndpoint.js";
/** Public identity committed by passive V8 Inspector observations. */
export { V8_INSPECTOR_PROVIDER_IDENTITY } from "./providerIdentity.js";
import { V8_INSPECTOR_PROVIDER_IDENTITY } from "./providerIdentity.js";
/** Maximum decoded CDP message accepted while observing one Inspector target. */
export const INSPECTOR_MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;
/** Aggregate retained metadata budget, including an estimate of JS object overhead. */
export const INSPECTOR_MAX_RETAINED_METADATA_BYTES = 8 * 1024 * 1024;
const RETAINED_OBJECT_OVERHEAD_BYTES = 512;
/** Attach-only provider; sends only Runtime.enable and Debugger.enable. */
export class V8InspectorProvider {
    identity() {
        return V8_INSPECTOR_PROVIDER_IDENTITY;
    }
    async listTargets(input, options = {}) {
        try {
            const discovery = await discoverV8Inspector(input.inspector_endpoint, "list_javascript_runtime_targets", options.signal);
            const allowed = [];
            const excluded = createInspectorExclusionCounts();
            for (const target of discovery.targets) {
                const decision = await authorizeRuntimeTargetLocation(target.url, {
                    type: target.type,
                    product: discovery.runtime.product,
                });
                if (!decision.allowed) {
                    excluded[inspectorExclusionKey(decision.reason)] += 1;
                    continue;
                }
                if (decision.location.kind === "builtin") {
                    excluded.unsupported_location += 1;
                    continue;
                }
                allowed.push({ ...target, location: decision.location });
            }
            allowed.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
            return ok(javascriptRuntimeTargetListSchema.parse({
                runtime: discovery.runtime,
                targets: allowed.map(projectTarget),
                excluded: { ...excluded, unconnectable: 0 },
                limitations: describeInspectorTargetLimitations(),
            }));
        }
        catch (cause) {
            return err(providerError(cause, "list_javascript_runtime_targets"));
        }
    }
    async observe(input, options = {}) {
        let connection;
        let primaryFailure;
        let failed = false;
        let cleanupFailure;
        let cleanupFailed = false;
        let outcome;
        try {
            const discovery = await discoverV8Inspector(input.inspector_endpoint, "observe_javascript_runtime", options.signal);
            const target = await authorizedTarget(discovery.targets, input, discovery.runtime.product);
            if (input.runtime_kind !== undefined)
                assertRuntimeKind(target, input.runtime_kind);
            connection = await CdpConnection.connect(target.webSocketUrl, "observe_javascript_runtime", options.signal, { maxPayloadBytes: INSPECTOR_MAX_PAYLOAD_BYTES });
            const state = emptyCaptureState();
            const removeListener = connection.onEvent((event) => ingestEvent(event, input, state));
            try {
                await connection.send("Runtime.enable", {}, undefined, options.signal);
                await connection.send("Debugger.enable", {}, undefined, options.signal);
                await waitForCapture(connection, input.observation_ms, options.signal);
            }
            finally {
                removeListener();
            }
            const result = await finalizeInspectorCapture({
                input,
                runtime: discovery.runtime,
                target,
                state,
                ...(options.signal === undefined ? {} : { signal: options.signal }),
            });
            outcome = ok(javascriptRuntimeObservationSchema.parse(result));
        }
        catch (cause) {
            failed = true;
            primaryFailure = cause;
            outcome = err(providerError(cause, "observe_javascript_runtime"));
        }
        finally {
            if (connection !== undefined)
                try {
                    await closeInspectorConnection(connection, options.signal);
                }
                catch (cause) {
                    cleanupFailed = true;
                    cleanupFailure = cause;
                }
        }
        if (cleanupFailed) {
            return err(inspectorCleanupError(primaryFailure, cleanupFailure, failed));
        }
        return (outcome ??
            err(new BrowserObservationError("observe_javascript_runtime", "protocol_error")));
    }
}
export const closeInspectorConnection = async (connection, signal) => {
    const closing = connection.close();
    // best-effort cleanup: the race below observes the close; this only prevents
    // unhandled rejection when the caller abandons the close via cancellation.
    void closing.catch(() => undefined);
    // CdpConnection.close has its own one second transport bound. Do not make a
    // cancelled caller wait for that fallback.
    if (signal === undefined)
        return await closing;
    let onAbort;
    const cancelled = new Promise((resolve) => {
        onAbort = () => resolve();
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted)
            onAbort();
    });
    try {
        await Promise.race([closing, cancelled]);
    }
    finally {
        if (onAbort !== undefined)
            signal.removeEventListener("abort", onAbort);
    }
};
export const inspectorCleanupError = (primaryFailure, cleanupFailure, hasPrimaryFailure) => {
    const cause = hasPrimaryFailure
        ? new AggregateError([primaryFailure, cleanupFailure], "Inspector observation and cleanup both failed")
        : cleanupFailure;
    return new BrowserObservationError("observe_javascript_runtime", "cleanup_failed", { cause });
};
const projectTarget = (target) => ({
    target_id: target.id,
    protocol_type: target.type,
    attached: target.attached,
    location: target.location,
});
const authorizedTarget = async (targets, input, product) => {
    const target = targets.find(({ id }) => id === input.target_id);
    if (target === undefined)
        throw new BrowserObservationError("observe_javascript_runtime", "target_not_found");
    const decision = await authorizeRuntimeTargetLocation(target.url, {
        type: target.type,
        product,
    });
    if (target.attached ||
        !decision.allowed ||
        decision.location.kind === "builtin")
        throw new BrowserObservationError("observe_javascript_runtime", "target_not_allowed");
    return { ...target, location: decision.location };
};
const assertRuntimeKind = (target, kind) => {
    const accepted = kind === "electron-preload" || kind === "electron-renderer"
        ? target.type === "page"
        : target.type === "node";
    if (!accepted)
        throw new BrowserObservationError("observe_javascript_runtime", "target_not_allowed");
};
const emptyCaptureState = () => ({
    scripts: [],
    contexts: new Map(),
    eventsObserved: 0,
    eventsRetained: 0,
    eventsDropped: 0,
    metadataBytes: 0,
    scriptsObserved: 0,
    invalidScripts: 0,
    truncated: false,
    truncationReasons: new Set(),
});
const ingestEvent = (event, input, state) => {
    if (event.method !== "Debugger.scriptParsed" &&
        event.method !== "Debugger.scriptFailedToParse" &&
        event.method !== "Runtime.executionContextCreated" &&
        event.method !== "Runtime.executionContextDestroyed" &&
        event.method !== "Runtime.executionContextsCleared")
        return;
    state.eventsObserved += 1;
    if (event.method === "Debugger.scriptParsed") {
        ingestScript(event, input, state);
        return;
    }
    if (event.method === "Debugger.scriptFailedToParse") {
        state.invalidScripts += 1;
        retainEvent(state, 0);
        return;
    }
    ingestContext(event, input, state);
};
const ingestScript = (event, input, state) => {
    state.scriptsObserved += 1;
    const value = recordValue(event.params);
    const rawUrl = cdpStringValue(value?.url);
    if (rawUrl === undefined || rawUrl === "") {
        state.invalidScripts += 1;
        retainEvent(state, 0);
        return;
    }
    const draft = {
        rawUrl,
        executionContextKey: contextKey(value?.executionContextId),
        cdpHash: cdpStringValue(value?.hash) ?? null,
        length: nonnegativeInteger(value?.length),
        isModule: value?.isModule === true,
    };
    const bytes = retainedMetadataBytes(draft);
    if (!retainEvent(state, bytes))
        return;
    state.scripts.push(draft);
};
const ingestContext = (event, input, state) => {
    if (event.method === "Runtime.executionContextsCleared") {
        let byteDelta = 0;
        for (const context of state.contexts.values()) {
            byteDelta +=
                retainedMetadataBytes({ ...context, state: "cleared" }) -
                    retainedMetadataBytes(context);
        }
        if (replaceRetainedMetadata(state, byteDelta)) {
            for (const context of state.contexts.values())
                context.state = "cleared";
            retainEvent(state, 0);
        }
        return;
    }
    const parameters = recordValue(event.params);
    const runtimeContext = event.method === "Runtime.executionContextCreated"
        ? recordValue(parameters?.context)
        : parameters;
    const key = contextKey(event.method === "Runtime.executionContextCreated"
        ? runtimeContext?.id
        : runtimeContext?.executionContextId);
    if (key === null) {
        retainEvent(state, 0);
        return;
    }
    const origin = event.method === "Runtime.executionContextCreated"
        ? (cdpStringValue(runtimeContext?.origin) ?? null)
        : null;
    const draft = {
        contextKey: key,
        state: event.method === "Runtime.executionContextCreated"
            ? "created"
            : "destroyed",
        origin: origin === "" ? null : origin,
    };
    const previous = state.contexts.get(key);
    const bytes = retainedMetadataBytes(draft) -
        (previous === undefined ? 0 : retainedMetadataBytes(previous));
    if (!retainEvent(state, bytes))
        return;
    state.contexts.set(key, draft);
};
const retainEvent = (state, bytes) => {
    if (!replaceRetainedMetadata(state, bytes))
        return false;
    state.eventsRetained += 1;
    return true;
};
const replaceRetainedMetadata = (state, byteDelta) => {
    if (state.metadataBytes + byteDelta > INSPECTOR_MAX_RETAINED_METADATA_BYTES) {
        state.eventsDropped += 1;
        state.truncated = true;
        state.truncationReasons.add("retained_metadata_budget_exceeded");
        return false;
    }
    state.metadataBytes += byteDelta;
    return true;
};
const waitForCapture = async (connection, observationMs, signal) => {
    let removeDisconnect = () => undefined;
    const disconnected = new Promise((_resolve, reject) => {
        removeDisconnect = connection.onDisconnect((error) => reject(error));
    });
    try {
        await Promise.race([
            delayWithCancellation(observationMs, "observe_javascript_runtime", signal),
            disconnected,
        ]);
    }
    finally {
        removeDisconnect();
    }
};
const retainedMetadataBytes = (value) => {
    const strings = "rawUrl" in value
        ? [value.rawUrl, value.rawUrl, value.executionContextKey, value.cdpHash]
        : [value.contextKey, value.origin];
    return (RETAINED_OBJECT_OVERHEAD_BYTES +
        strings.reduce((total, text) => total + (text?.length ?? 0) * 2, 0));
};
const nonnegativeInteger = (value) => {
    const parsed = numberValue(value);
    return parsed === undefined ? 0 : Math.max(0, Math.trunc(parsed));
};
const contextKey = (value) => {
    const identifier = numberValue(value);
    return identifier !== undefined && Number.isSafeInteger(identifier)
        ? String(identifier)
        : null;
};
const providerError = (cause, operation) => {
    if (cause instanceof AnalysisError)
        return cause;
    return new ProviderAdapterError(V8_INSPECTOR_PROVIDER_IDENTITY.id, operation, {
        cause,
    });
};
