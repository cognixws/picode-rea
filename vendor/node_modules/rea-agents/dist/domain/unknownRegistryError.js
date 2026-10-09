import { AnalysisError } from "./analysisErrorBase.js";
/** Residual-unknown mutation failed a lifecycle, reference, or CAS invariant. */
export class UnknownRegistryError extends AnalysisError {
    reason;
    _tag = "UnknownRegistryError";
    constructor(reason, options) {
        super(`Residual unknown registry mutation failed: ${reason}`, options);
        this.reason = reason;
    }
}
