import { err } from "../domain/result.js";
/** Owns the socket write and pending-reply lifecycle for one bridge session. */
export class GhidraWire {
    #options;
    constructor(options) {
        this.#options = options;
    }
    /** Write one authenticated request and return its correlated reply. */
    async request(method, params, options) {
        const socket = this.#options.getSocket();
        const token = this.#options.getToken();
        if (socket === undefined || socket.destroyed || token === undefined)
            return err(this.#options.failure("process", "Ghidra bridge is unavailable"));
        if (options.signal?.aborted === true)
            return err(this.#options.failure("cancelled", "Ghidra request was cancelled"));
        const id = this.#options.nextId();
        if (options.timeoutMs !== undefined && options.timeoutMs <= 0)
            return err(this.#options.failure("timeout", "Ghidra request deadline elapsed", undefined, { timeoutMs: options.timeoutMs }));
        const timeoutMs = options.timeoutMs;
        const response = this.#options.pending.wait(id, {
            ...(timeoutMs === undefined
                ? {}
                : {
                    timeoutMs,
                    timeoutValue: () => err(this.#options.failure("timeout", "Ghidra bridge request timed out", undefined, { timeoutMs })),
                }),
            ...(options.signal === undefined ? {} : { signal: options.signal }),
            cancelledValue: () => err(this.#options.failure("cancelled", "Ghidra request was cancelled")),
        });
        socket.write(`${JSON.stringify({ id, token, method, params })}\n`, (cause) => {
            if (cause !== undefined && cause !== null)
                this.#options.pending.settle(id, err(this.#options.failure("process", "Ghidra bridge write failed", cause)));
        });
        const result = await response;
        this.#options.logger[result.ok ? "debug" : "warn"]({ method, status: result.ok ? "ok" : "error" }, "Ghidra bridge request completed");
        return result;
    }
}
