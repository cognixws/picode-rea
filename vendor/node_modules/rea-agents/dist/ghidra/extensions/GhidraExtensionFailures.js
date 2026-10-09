import { AnalysisCapabilityUnavailableError } from "../../domain/analysisErrorCore.js";
import { ProviderAdapterError } from "../../domain/providerAdapterError.js";
import { jsonValueSchema } from "../../domain/jsonValue.js";
import { validateGhidraExtensionResults, } from "./GhidraExtensions.js";
/** Preserve unsupported recovery separately from malformed or failed producers. */
export const ghidraExtensionFailure = (extensions, results, operation) => {
    const reports = results;
    const invalid = validateGhidraExtensionResults(extensions, reports);
    const failed = reports.find((value) => value.status === "unsupported" || value.status === "failed");
    if (invalid === null && failed === undefined)
        return undefined;
    return invalid === null && failed?.status === "unsupported"
        ? new AnalysisCapabilityUnavailableError("ghidra", operation, `${failed.id}: ${failed.reason}. Omit REA_GHIDRA_NATIVEAOT_JAR to continue ordinary native analysis.`)
        : new ProviderAdapterError("ghidra", operation, {
            diagnostics: {
                reason: invalid ?? failed?.reason ?? "Ghidra extension failed",
                analysis_extensions: jsonValueSchema.parse(reports),
            },
        });
};
