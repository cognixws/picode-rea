import { err } from "../domain/result.js";
import { ghidraResponseResult, parseGhidraResponseLine } from "./protocol.js";
/** Routes validated response IDs without giving the wire protocol client state. */
export class GhidraResponseRouter {
    #options;
    constructor(options) {
        this.#options = options;
    }
    /** Parse and settle one complete response line. */
    route(line) {
        const parsed = parseGhidraResponseLine(line);
        if (!parsed.ok) {
            this.#options.protocolFailure(parsed.error.message, parsed.error);
            return;
        }
        if (!this.#options.pending.has(parsed.value.id)) {
            if (parsed.value.id >= this.#options.nextId())
                this.#options.protocolFailure("Ghidra returned an unknown response id");
            return;
        }
        const result = ghidraResponseResult(parsed.value);
        this.#options.pending.settle(parsed.value.id, result.ok ? result : err(this.#options.remoteFailure(result.error)));
    }
}
