import { AnalysisError } from "../../domain/analysisErrorBase.js";
import { AnalysisTimeoutError } from "../../domain/analysisErrorCore.js";
import { BrowserObservationError } from "../../domain/browserObservationError.js";
import { ProviderCleanupError } from "../../domain/providerCleanupError.js";
import { sanitizeBrowserUrl } from "../../domain/browserObservation.js";
import { WEB_RUNTIME_LIMITS, } from "../../domain/webRuntime.js";
import { authorizeCdpTarget } from "../CdpAuthorizedTarget.js";
import { authorizedMainFrame } from "../CdpAuthorizedMainFrame.js";
import { discoverCdpEndpoint, } from "../CdpEndpoint.js";
import { openCdpTargetSession, } from "../CdpTargetSession.js";
import { runtimeFrameTreeSchema } from "./CdpRuntimeProtocol.js";
/** Owned transport and instrumentation; the selected browser/page remain externally owned. */
export class CdpRuntimeSession {
    transport;
    discovery;
    target;
    allowedOrigins;
    operation;
    options;
    enabledDomains = [];
    preciseCoverageMayBeActive = false;
    #completion;
    #completionTimer;
    constructor(transport, discovery, target, allowedOrigins, operation, options) {
        this.transport = transport;
        this.discovery = discovery;
        this.target = target;
        this.allowedOrigins = allowedOrigins;
        this.operation = operation;
        this.options = options;
    }
    /** Acquire a validated target; failed setup releases its owned socket. */
    static async open(input, operation, options) {
        return runtimeDeadline(operation, options.signal, async (signal) => {
            const discovery = await discoverCdpEndpoint(input.cdp_endpoint, operation, signal);
            const { target, allowedOrigins } = authorizeCdpTarget(discovery, input, operation);
            const transport = await openCdpTargetSession(discovery, target, operation, signal, { maxPayloadBytes: WEB_RUNTIME_LIMITS.protocolBytes });
            try {
                const tree = runtimeFrameTreeSchema.parse(await authorizedMainFrame({
                    ...transport,
                    allowedOrigins,
                    signal,
                    operation,
                }));
                const frame = tree.frameTree.frame;
                const url = sanitizeBrowserUrl(frame.url);
                if (url.origin === null)
                    throw new BrowserObservationError(operation, "target_not_allowed");
                return new CdpRuntimeSession(transport, discovery, {
                    target_id: target.id,
                    initial_url: url.url,
                    origin: url.origin,
                    frame_id: frame.id,
                    loader_id: frame.loaderId ?? null,
                }, allowedOrigins, operation, options);
            }
            catch (cause) {
                await transport.connection.close();
                throw cause;
            }
        });
    }
    /** Bound each command separately from the caller-selected observation duration. */
    async command(method, params = {}) {
        const signals = [this.options.signal, this.#completion?.signal].filter((signal) => signal !== undefined);
        try {
            return await runtimeDeadline(this.operation, signals.length === 0 ? undefined : AbortSignal.any(signals), (signal) => this.transport.connection.send(method, params, this.transport.sessionId, signal));
        }
        catch (cause) {
            if (this.#completion?.signal.aborted && !this.options.signal?.aborted)
                throw new AnalysisTimeoutError(this.operation, WEB_RUNTIME_LIMITS.commandTimeoutMs);
            throw cause;
        }
    }
    /** Bound the complete inspection/source-join phase as well as each individual command. */
    beginCompletion() {
        if (this.#completion !== undefined)
            return;
        this.#completion = new AbortController();
        this.#completionTimer = setTimeout(() => this.#completion?.abort(), WEB_RUNTIME_LIMITS.commandTimeoutMs);
    }
    /** Register cleanup before sending: cancellation can occur after producer acceptance. */
    async enable(domain) {
        this.enabledDomains.push(domain);
        await this.command(`${domain}.enable`);
    }
    /** Check document identity before joining any live node or final coverage evidence. */
    async assertDocument() {
        const frame = runtimeFrameTreeSchema.parse(await this.command("Page.getFrameTree")).frameTree.frame;
        const url = sanitizeBrowserUrl(frame.url);
        if (frame.id !== this.target.frame_id ||
            (frame.loaderId ?? null) !== this.target.loader_id ||
            (this.target.loader_id === null && url.url !== this.target.initial_url))
            throw new BrowserObservationError(this.operation, "target_changed", {
                detail: `Selected target ${this.target.target_id} changed document during ${this.operation}.`,
            });
        if (url.origin === null || !this.allowedOrigins.has(url.origin))
            throw new BrowserObservationError(this.operation, "target_not_allowed", {
                detail: `Selected target ${this.target.target_id} moved to an unselected origin during ${this.operation}.`,
            });
    }
    /** Cleanup uses its own deadline after caller cancellation, then closes REA's transport. */
    async close(previousError, objectGroup) {
        if (this.#completionTimer !== undefined)
            clearTimeout(this.#completionTimer);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), WEB_RUNTIME_LIMITS.cleanupTimeoutMs);
        const failures = [];
        const send = async (method, params = {}) => {
            try {
                await this.transport.connection.send(method, params, this.transport.sessionId, controller.signal);
            }
            catch (cause) {
                failures.push(`${method}: ${cause instanceof AnalysisError ? (cause.userMessage ?? cause.message) : cause instanceof Error ? cause.message : String(cause)}`);
            }
        };
        try {
            if (this.preciseCoverageMayBeActive)
                await send("Profiler.stopPreciseCoverage");
            if (objectGroup !== undefined)
                await send("Runtime.releaseObjectGroup", { objectGroup });
            for (const domain of [...this.enabledDomains].reverse())
                await send(`${domain}.disable`);
            if (this.transport.sessionId !== undefined) {
                try {
                    await this.transport.connection.send("Target.detachFromTarget", { sessionId: this.transport.sessionId }, undefined, controller.signal);
                }
                catch (cause) {
                    failures.push(`Target.detachFromTarget: ${cause instanceof AnalysisError ? (cause.userMessage ?? cause.message) : cause instanceof Error ? cause.message : String(cause)}`);
                }
            }
        }
        finally {
            clearTimeout(timer);
            await this.transport.connection.close();
        }
        return failures.length === 0
            ? undefined
            : new ProviderCleanupError("rea-cdp-browser", [this.target.target_id, "runtime-instrumentation"], {
                target_id: this.target.target_id,
                cleanup_failures: failures,
                previous_error: previousError?.userMessage ?? previousError?.message ?? null,
            }, { operation: this.operation });
    }
}
/** Apply a disposable command deadline without turning timeout into caller cancellation. */
export const runtimeDeadline = async (operation, signal, run) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEB_RUNTIME_LIMITS.commandTimeoutMs);
    try {
        return await run(signal === undefined
            ? controller.signal
            : AbortSignal.any([signal, controller.signal]));
    }
    catch (cause) {
        if (controller.signal.aborted && signal?.aborted !== true)
            throw new AnalysisTimeoutError(operation, WEB_RUNTIME_LIMITS.commandTimeoutMs);
        throw cause;
    }
    finally {
        clearTimeout(timer);
    }
};
