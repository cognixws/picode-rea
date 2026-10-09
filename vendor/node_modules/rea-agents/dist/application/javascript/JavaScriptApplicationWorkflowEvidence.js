import { createEvidence, } from "../../domain/evidence.js";
import { jsonValueSchema } from "../../domain/jsonValue.js";
import { JAVASCRIPT_APPLICATION_WORKFLOW_PROVIDER } from "../InvestigationProviders.js";
/** Create derived Evidence for one bounded application-graph feature trace. */
export const createApplicationFeatureTraceEvidence = (parameters, result) => createEvidence(undefined, JAVASCRIPT_APPLICATION_WORKFLOW_PROVIDER, {
    predicateType: "rea.application-feature-trace",
    operation: "trace_application_feature",
    parameters,
    result: jsonValueSchema.parse(result),
    rawResult: null,
    confidence: "inferred",
    authority: "analyst-inference",
    environment: null,
    limitations: result.limitations,
    evidenceLinks: result.evidence_links,
});
/** Create derived Evidence for one bounded JavaScript semantic trace. */
export const createJavaScriptSemanticTraceEvidence = (parameters, result) => createEvidence(undefined, JAVASCRIPT_APPLICATION_WORKFLOW_PROVIDER, {
    predicateType: "rea.javascript-semantic-trace",
    operation: "trace_javascript_semantics",
    parameters,
    result: jsonValueSchema.parse(result),
    rawResult: null,
    confidence: "inferred",
    authority: "analyst-inference",
    environment: null,
    limitations: result.limitations,
    evidenceLinks: result.evidence_links,
});
/** Create derived Evidence for one tiered application version comparison. */
export const createApplicationVersionComparisonEvidence = (parameters, result) => createEvidence(undefined, JAVASCRIPT_APPLICATION_WORKFLOW_PROVIDER, {
    predicateType: "rea.application-version-comparison",
    operation: "compare_application_versions",
    parameters,
    result: jsonValueSchema.parse(result),
    rawResult: null,
    confidence: "inferred",
    authority: "analyst-inference",
    environment: null,
    limitations: result.limitations,
    evidenceLinks: result.evidence_links,
});
/** Create derived Evidence for one historical-source to bundle comparison. */
export const createSourceToBundleComparisonEvidence = (parameters, result) => createEvidence(undefined, JAVASCRIPT_APPLICATION_WORKFLOW_PROVIDER, {
    predicateType: "rea.source-to-bundle-comparison",
    operation: "compare_source_to_bundle",
    parameters,
    result: jsonValueSchema.parse(result),
    rawResult: null,
    confidence: "inferred",
    authority: "analyst-inference",
    environment: null,
    limitations: result.limitations,
    evidenceLinks: result.evidence_links,
});
/** Create derived Evidence for one bounded static export-shape comparison. */
export const createJavaScriptExportShapeComparisonEvidence = (parameters, result) => createEvidence(undefined, JAVASCRIPT_APPLICATION_WORKFLOW_PROVIDER, {
    predicateType: "rea.javascript-export-shape-comparison",
    operation: "compare_javascript_export_shapes",
    parameters,
    result: jsonValueSchema.parse(result),
    rawResult: null,
    confidence: "inferred",
    authority: "analyst-inference",
    environment: null,
    limitations: result.limitations,
    evidenceLinks: result.evidence_links,
});
