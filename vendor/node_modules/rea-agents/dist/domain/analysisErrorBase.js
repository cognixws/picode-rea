/** Stable tags exposed by safe analysis-error projections. */
const ANALYSIS_ERROR_TAGS = [
    "AnalysisProtocolError",
    "AnalysisInputError",
    "AnalysisAccessDeniedError",
    "AnalysisArtifactChangedError",
    "AnalysisOutputError",
    "AnalysisCapabilityUnavailableError",
    "AnalysisUnsupportedTargetError",
    "AnalysisCancelledError",
    "AnalysisTimeoutError",
    "AnalysisResourceConstraintError",
    "ProviderSelectionError",
    "ProviderAdapterError",
    "BrowserObservationError",
    "ArtifactOperationError",
    "ProcessCaptureError",
    "EvidenceIntegrityError",
    "EvidenceFileError",
    "UnknownRegistryError",
    "HopperTimeoutError",
    "HopperCancelledError",
    "HopperProtocolError",
    "HopperRemoteError",
    "HopperProcessError",
    "HopperStartError",
    "ConfigurationError",
    "NoBinaryOpenError",
    "BinaryTargetError",
];
/** Base class for expected analysis, provider, and session failures. */
export class AnalysisError extends Error {
    capturedOutput;
    cleanup;
    cleanupIncomplete;
    cleanupResources;
    constructor(message, options) {
        super(message, options);
        this.capturedOutput =
            options?.capturedOutput === undefined
                ? undefined
                : { ...options.capturedOutput };
        this.cleanup = options?.cleanup;
        this.cleanupIncomplete = options?.cleanup !== undefined;
        this.cleanupResources = options?.cleanup?.resources ?? [];
        this.partialObservation = options?.partialObservation;
    }
    userMessage = undefined;
    userCategory = undefined;
    executionFailure = undefined;
    partialObservation;
    cleanupReport = undefined;
}
