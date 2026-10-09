import { AnalysisError, } from "./analysisErrorBase.js";
/** No configured provider can satisfy a requested operation or target binding. */
export class ProviderSelectionError extends AnalysisError {
    _tag = "ProviderSelectionError";
    operation;
    reason;
    requestedProviderId;
    candidateIds;
    rejections;
    userMessage;
    constructor(options) {
        const operation = options.operation ?? "open_binary";
        super(providerSelectionDiagnostic(options), options.capturedOutput === undefined
            ? undefined
            : { capturedOutput: options.capturedOutput });
        this.operation = operation;
        this.reason = options.reason;
        this.requestedProviderId = options.requestedProviderId;
        this.candidateIds = [...options.candidateIds];
        this.rejections = [...(options.rejections ?? [])].map((rejection) => ({
            ...rejection,
            diagnostics: structuredClone(rejection.diagnostics),
        }));
        this.userMessage = providerSelectionUserMessage(options);
    }
}
const providerSelectionDiagnostic = (options) => {
    const candidates = options.candidateIds.length === 0
        ? "none"
        : options.candidateIds.join(", ");
    return `Analysis provider selection failed (${options.reason}) for ${options.requestedProviderId}; candidates: ${candidates}`;
};
const providerSelectionUserMessage = (options) => {
    switch (options.reason) {
        case "ambiguous":
            return "Multiple analysis providers support this target. Choose one with provider_id, --provider, or REA_ANALYSIS_PROVIDER.";
        case "unknown_provider":
            return `The requested analysis provider is unknown. Choose one of: ${options.candidateIds.join(", ") || "no configured providers"}.`;
        case "provider_unavailable":
            return "The selected analysis provider is unavailable. Review the reported local diagnostics or run `rea doctor`, then retry.";
        case "target_unsupported":
            return "The selected analysis provider does not support this target. Choose another provider or open a supported extracted binary.";
        case "invalid_options":
            return "The analysis provider selection or open options are invalid. Correct them and try again.";
    }
};
