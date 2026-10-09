import { JAVASCRIPT_APPLICATION_PROVIDER, JAVASCRIPT_RUNTIME_RECONCILIATION_PROVIDER, MANAGED_WORKFLOW_PROVIDER, } from "../InvestigationProviders.js";
import { isImmutableEvidence, parseEvidence, } from "../../domain/evidence.js";
import { analyzeJavaScriptApplicationInputSchema, javascriptApplicationAnalysisResultSchema, } from "../../domain/javascript/javascriptApplicationAnalysis.js";
import { javascriptRuntimeReconciliationResultSchema } from "../../domain/javascript/javascriptRuntimeReconciliationSchemas.js";
import { managedApplicationGraphResultSchema } from "../../domain/managed/managedApplicationGraph.js";
const ownedApplicationSources = new WeakMap();
/** Retain the producer-validated meaning of its exact immutable result snapshot. */
export const rememberOwnedApplicationGraphEvidence = (evidence, result) => {
    if (!isImmutableEvidence(evidence) ||
        evidence.normalized_result !== result ||
        evidence.operation !== "analyze_javascript_application" ||
        !providerMatches(evidence, JAVASCRIPT_APPLICATION_PROVIDER))
        throw new TypeError("Owned application Evidence must bind its exact validated immutable result");
    ownedApplicationSources.set(evidence, Object.freeze(staticApplicationSourceForResult(evidence, result)));
    return evidence;
};
/** Parse and authenticate one REA-produced JavaScript Application Graph Evidence. */
export const parseApplicationGraphEvidence = (input) => {
    const evidence = parseEvidence(input);
    const owned = ownedApplicationSources.get(evidence);
    if (owned !== undefined)
        return owned;
    if (evidence.operation === "analyze_javascript_application" &&
        evidence.predicate_type === "rea.javascript-application-analysis" &&
        providerMatches(evidence, JAVASCRIPT_APPLICATION_PROVIDER))
        return staticApplicationSource(evidence);
    if (evidence.operation === "reconcile_javascript_runtime" &&
        evidence.predicate_type === "rea.javascript-runtime-reconciliation" &&
        providerMatches(evidence, JAVASCRIPT_RUNTIME_RECONCILIATION_PROVIDER))
        return staticRuntimeSource(evidence);
    if (evidence.operation === "project_managed_application_graph" &&
        evidence.predicate_type === "rea.managed-application-graph" &&
        providerMatches(evidence, MANAGED_WORKFLOW_PROVIDER))
        return managedApplicationSource(evidence);
    throw new TypeError("Application workflow requires authenticated analyze_javascript_application, reconcile_javascript_runtime, or project_managed_application_graph Evidence");
};
const staticApplicationSource = (evidence) => {
    const result = javascriptApplicationAnalysisResultSchema.parse(evidence.normalized_result);
    return staticApplicationSourceForResult(evidence, result);
};
const staticApplicationSourceForResult = (evidence, result) => {
    if (evidence.authority !== "shipped-artifact" ||
        evidence.confidence !== "derived")
        throw new TypeError("JavaScript application Evidence authority or confidence is invalid");
    if (evidence.predicate_type !== "rea.javascript-application-analysis")
        throw new TypeError("JavaScript application Evidence predicate does not match its result shape");
    analyzeJavaScriptApplicationInputSchema.parse({
        input_path: result.input_path,
        ...evidence.parameters,
    });
    assertApplicationSubject(evidence, result);
    return {
        evidence,
        graph: result.graph,
        kind: "static-application",
        rootArtifactSha256: result.root_artifact_sha256,
        semanticGraph: result.semantic_graph,
    };
};
const staticRuntimeSource = (evidence) => {
    if (evidence.authority !== "analyst-inference" ||
        evidence.confidence !== "inferred")
        throw new TypeError("JavaScript runtime reconciliation Evidence authority or confidence is invalid");
    const result = javascriptRuntimeReconciliationResultSchema.parse(evidence.normalized_result);
    if (result.evidence_links.some((evidenceId) => !evidence.evidence_links.includes(evidenceId)))
        throw new TypeError("Runtime reconciliation result references Evidence outside its envelope");
    const applicationLayer = result.static_layers.find(({ role }) => role === "application");
    if (applicationLayer === undefined)
        throw new TypeError("Runtime reconciliation application layer is missing");
    return {
        evidence,
        graph: result.graph,
        kind: "static-runtime-reconciliation",
        rootArtifactSha256: applicationLayer.root_artifact_sha256,
        semanticGraph: null,
    };
};
const managedApplicationSource = (evidence) => {
    if (evidence.authority !== "analyst-inference" ||
        evidence.confidence !== "inferred")
        throw new TypeError("Managed application graph Evidence authority or confidence is invalid");
    const result = managedApplicationGraphResultSchema.parse(evidence.normalized_result);
    if (result.evidence_links.some((evidenceId) => !evidence.evidence_links.includes(evidenceId)))
        throw new TypeError("Managed application graph result references Evidence outside its envelope");
    return {
        evidence,
        graph: result.graph,
        kind: "managed-application",
        rootArtifactSha256: result.root_artifact_sha256,
        semanticGraph: null,
    };
};
const assertApplicationSubject = (evidence, result) => {
    if (evidence.subject === null ||
        evidence.subject.digest.sha256 !== result.root_artifact_sha256 ||
        evidence.subject.format !== result.format ||
        evidence.subject.local_path !== result.input_path)
        throw new TypeError("JavaScript application Evidence subject does not match its result");
};
const providerMatches = (evidence, provider) => evidence.provider.id === provider.id &&
    evidence.provider.name === provider.name &&
    evidence.provider.version === provider.version;
/** Parse unique, artifact-bound Evidence that may extend a native handoff. */
export const parseNativeApplicationEvidence = (inputs) => {
    const parsed = inputs.map((input) => parseEvidence(input));
    if (parsed.some(({ subject }) => subject === null))
        throw new TypeError("Native handoff Evidence requires an artifact subject");
    const ids = parsed.map(({ evidence_id: id }) => id);
    if (new Set(ids).size !== ids.length)
        throw new TypeError("Native handoff Evidence must be unique");
    return parsed;
};
