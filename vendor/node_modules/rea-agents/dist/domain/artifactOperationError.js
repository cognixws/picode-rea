import { AnalysisError } from "./analysisErrorBase.js";
/** Artifact inventory or extraction failed a typed safety boundary. */
export class ArtifactOperationError extends AnalysisError {
    operation;
    reason;
    artifactDetails;
    detail;
    _tag = "ArtifactOperationError";
    constructor(operation, reason, artifactDetails, 
    /** The specific constraint that failed, such as the colliding path. */
    detail) {
        super(artifactDetails === undefined
            ? `Artifact ${operation} failed: ${reason}`
            : `Artifact ${operation} failed: ${reason} at ${artifactDetails.logicalPath} (declared_sha256=${artifactDetails.declaredSha256 ?? "unavailable"}, calculated_sha256=${artifactDetails.calculatedSha256 ?? "unavailable"}, unpacked=${String(artifactDetails.unpacked)})`);
        this.operation = operation;
        this.reason = reason;
        this.artifactDetails = artifactDetails;
        this.detail = detail;
    }
}
