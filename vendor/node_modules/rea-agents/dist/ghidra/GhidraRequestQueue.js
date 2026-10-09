import { err } from "../domain/result.js";
/** FIFO that admits one Ghidra Program request at a time. */
export class GhidraRequestQueue {
    execute;
    failure;
    onActiveCancellation;
    #queue = [];
    #active = false;
    #closedFailure;
    constructor(execute, failure, onActiveCancellation) {
        this.execute = execute;
        this.failure = failure;
        this.onActiveCancellation = onActiveCancellation;
    }
    /** Queue one request until it completes, is cancelled, or the session closes. */
    run(method, parameters, options) {
        if (this.#closedFailure !== undefined)
            return Promise.resolve(err(this.#closedFailure));
        if (options.signal?.aborted === true)
            return Promise.resolve(err(this.failure("cancelled", "Ghidra request was cancelled")));
        return new Promise((resolve) => {
            let entry;
            const onAbort = options.signal === undefined
                ? undefined
                : () => this.#rejectQueued(entry, err(this.failure("cancelled", "Ghidra request was cancelled")));
            entry = {
                method,
                parameters,
                signal: options.signal,
                resolve,
                onAbort,
            };
            this.#queue.push(entry);
            if (onAbort !== undefined)
                options.signal?.addEventListener("abort", onAbort, { once: true });
            this.#drain();
        });
    }
    /** Fail requests that have not crossed the socket during session cleanup. */
    failQueued(failure) {
        this.#closedFailure = failure;
        for (const entry of this.#queue.splice(0)) {
            this.#release(entry);
            entry.resolve(err(failure));
        }
    }
    /** Admit requests after the owning client completes a new session startup. */
    reopen() {
        this.#closedFailure = undefined;
    }
    #drain() {
        if (this.#active)
            return;
        const entry = this.#queue.shift();
        if (entry === undefined)
            return;
        this.#release(entry);
        if (entry.signal?.aborted === true) {
            entry.resolve(err(this.failure("cancelled", "Ghidra request was cancelled")));
            this.#drain();
            return;
        }
        this.#active = true;
        let executionSettled = false;
        let activeCancellation;
        const onAbort = entry.signal === undefined
            ? undefined
            : () => {
                if (executionSettled)
                    return;
                this.failQueued(this.failure("process", "Ghidra session closed after active request cancellation"));
                activeCancellation = this.onActiveCancellation();
            };
        if (onAbort !== undefined)
            entry.signal?.addEventListener("abort", onAbort, { once: true });
        void this.execute(entry.method, entry.parameters, entry.signal === undefined ? {} : { signal: entry.signal })
            .then(async (result) => {
            if (activeCancellation !== undefined) {
                try {
                    await activeCancellation;
                }
                catch (cause) {
                    result = err(this.failure("process", cause instanceof Error
                        ? `Ghidra cleanup after cancellation failed: ${cause.message}`
                        : "Ghidra cleanup after cancellation failed", cause));
                }
            }
            executionSettled = true;
            entry.resolve(result);
        })
            .catch((cause) => {
            executionSettled = true;
            entry.resolve(err(this.failure("protocol", "Ghidra serial request execution rejected unexpectedly", cause)));
        })
            .finally(() => {
            if (entry.signal !== undefined && onAbort !== undefined)
                entry.signal.removeEventListener("abort", onAbort);
            this.#active = false;
            if (this.#closedFailure === undefined)
                this.#drain();
        });
    }
    #rejectQueued(entry, result) {
        const index = this.#queue.indexOf(entry);
        if (index < 0)
            return;
        this.#queue.splice(index, 1);
        this.#release(entry);
        entry.resolve(result);
    }
    #release(entry) {
        if (entry.signal !== undefined && entry.onAbort !== undefined)
            entry.signal.removeEventListener("abort", entry.onAbort);
    }
}
