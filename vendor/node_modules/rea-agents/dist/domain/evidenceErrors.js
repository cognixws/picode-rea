import { AnalysisError, } from "./analysisErrorBase.js";
/** Evidence identity, schema, or bundle manifests failed integrity checks. */
export class EvidenceIntegrityError extends AnalysisError {
    _tag = "EvidenceIntegrityError";
    userMessage;
    constructor(message, options) {
        super(message, options);
        this.userMessage = options?.userMessage;
    }
}
/** A valid snapshot belongs to a different target, provider, or analysis profile. */
export class AnalysisSnapshotMismatchError extends EvidenceIntegrityError {
}
/** A session Evidence reference is missing or has the wrong semantic identity. */
export class EvidenceReferenceError extends EvidenceIntegrityError {
    evidenceId;
    reason;
    expected;
    actual;
    constructor(evidenceId, reason, expected, actual) {
        super(`Evidence reference ${reason}: ${evidenceId}`);
        this.evidenceId = evidenceId;
        this.reason = reason;
        this.expected = expected;
        this.actual = actual;
    }
}
/** Evidence bundle filesystem access failed within the configured policy. */
export class EvidenceFileError extends AnalysisError {
    operation;
    reason;
    _tag = "EvidenceFileError";
    /** Caller-selected path that failed, resolved against the working directory. */
    path;
    constructor(operation, reason, options) {
        super(`Evidence bundle ${operation} failed: ${reason}`, options);
        this.operation = operation;
        this.reason = reason;
        this.path = options?.path;
    }
}
