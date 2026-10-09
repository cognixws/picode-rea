import { AnalysisCancelledError } from "../../domain/analysisErrorCore.js";
/** One finite document-scoped window, with an actual armed point and event-driven termination. */
export class CdpExecutionWindow {
    session;
    armedAt;
    endedAt;
    reason;
    #timer;
    #resolve;
    #reject;
    #failure;
    #removeAbort;
    constructor(session) {
        this.session = session;
    }
    /** Collection ends on a main-document replacement, never follows source URLs into another context. */
    ingest(event) {
        if (event.method === "Target.detachedFromTarget" ||
            event.method === "Inspector.targetCrashed") {
            this.end("target_terminated");
            return;
        }
        if (!this.active)
            return;
        if (event.method === "Runtime.executionContextsCleared")
            this.end("document_changed");
        if (event.method === "Page.frameNavigated" &&
            typeof event.params === "object" &&
            event.params !== null &&
            "frame" in event.params) {
            const frame = event.params.frame;
            if (typeof frame === "object" && frame !== null && !("parentId" in frame))
                this.end("document_changed");
        }
        if (event.method === "Page.frameDetached" &&
            typeof event.params === "object" &&
            event.params !== null &&
            "frameId" in event.params &&
            event.params.frameId === this.session.target.frame_id)
            this.end("document_changed");
    }
    /** Metadata before arming is inventory; request events outside the window are excluded. */
    get active() {
        return (this.armedAt !== undefined &&
            this.reason === undefined &&
            this.endedAt === undefined);
    }
    /** The timer starts at arming, before progress delivery can delay the external action. */
    start(duration) {
        this.armedAt = new Date().toISOString();
        if (this.#failure !== undefined)
            return Promise.reject(this.#failure);
        if (this.reason !== undefined)
            return Promise.resolve(this.reason);
        return new Promise((resolve, reject) => {
            this.#resolve = resolve;
            this.#reject = reject;
            this.#timer = setTimeout(() => this.end("window_elapsed"), duration);
            const signal = this.session.options.signal;
            const abort = () => {
                this.endedAt = new Date().toISOString();
                this.dispose();
                this.#reject?.(new AnalysisCancelledError(this.session.operation));
            };
            this.#removeAbort = () => signal?.removeEventListener("abort", abort);
            signal?.addEventListener("abort", abort, { once: true });
            if (signal?.aborted)
                abort();
        });
    }
    /** Transport loss ends the window; instrumentation cleanup still requires confirmation. */
    end(reason) {
        if (this.reason !== undefined || this.#failure !== undefined)
            return;
        this.reason = reason;
        this.endedAt = new Date().toISOString();
        this.dispose();
        this.#resolve?.(reason);
    }
    /** Invalid producer data ends instrumentation immediately with its original failure. */
    fail(error) {
        if (this.reason !== undefined || this.#failure !== undefined)
            return;
        this.#failure = error;
        this.endedAt = new Date().toISOString();
        this.dispose();
        this.#reject?.(error);
    }
    /** Surface a failure recorded before local arming without emitting misleading progress. */
    check() {
        if (this.#failure !== undefined)
            throw this.#failure;
    }
    /** Release local timer and abort listener on every setup/failure path. */
    dispose() {
        if (this.#timer !== undefined)
            clearTimeout(this.#timer);
        this.#removeAbort?.();
    }
}
