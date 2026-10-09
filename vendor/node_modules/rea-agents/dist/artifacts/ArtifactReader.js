/** Typed adapter failure translated at provider boundary. */
export class ArtifactReaderFailure extends Error {
    reason;
    details;
    constructor(reason, message, options, details) {
        super(message, options);
        this.reason = reason;
        this.details = details;
        this.name = "ArtifactReaderFailure";
    }
}
