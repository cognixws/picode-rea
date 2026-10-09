import { analyzeScript, emptyAccumulator, isIncludedScript, } from "./webBundleAnalyzerInspection.js";
import { buildWebBundleAnalysis } from "./webBundleAnalyzerResult.js";
/** Analyze selected captured JavaScript source without execution. */
export const analyzeCapturedWebBundle = (inspection, sourceMaps = {
    status: "not_requested",
    requested: 0,
    processed: 0,
    items: [],
}) => {
    const accumulator = emptyAccumulator();
    const sourceScripts = inspection.scripts.items.filter(isIncludedScript);
    for (const script of sourceScripts)
        analyzeScript(script, accumulator);
    return buildWebBundleAnalysis(inspection, sourceScripts, sourceMaps, accumulator);
};
