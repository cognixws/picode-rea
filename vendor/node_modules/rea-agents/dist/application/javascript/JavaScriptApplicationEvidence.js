import { createEvidence, createImmutableEvidenceSteps, } from "../../domain/evidence.js";
import { JAVASCRIPT_APPLICATION_PROVIDER } from "../InvestigationProviders.js";
import { freezeJsonSnapshot, freezeOwnedJsonSnapshotSteps, } from "../../domain/immutableJson.js";
import { rememberOwnedApplicationGraphEvidence } from "./JavaScriptApplicationEvidenceGraph.js";
import { completeJavaScriptAnalysisSteps } from "./JavaScriptAnalysisControl.js";
import { jsonValueValidationSteps } from "../../domain/jsonValue.js";
/** Transfer an already validated, application-owned result into immutable analysis Evidence. */
export const createOwnedJavaScriptApplicationEvidence = (input, result) => rememberOwnedApplicationGraphEvidence(createJavaScriptApplicationEvidence(input, freezeJsonSnapshot(result)), result);
/** Create owned analysis Evidence while allowing request cancellation during sealing and hashing. */
export const createOwnedJavaScriptApplicationEvidenceCooperatively = async (input, result, signal, progress) => {
    await reportEvidencePhase(progress, "seal_javascript_application_result", "Sealing the complete application analysis result");
    const snapshot = await completeJavaScriptAnalysisSteps(freezeOwnedJsonSnapshotSteps(result), signal);
    await reportEvidencePhase(progress, "validate_javascript_application_evidence", "Validating the immutable application Evidence JSON");
    // The Evidence envelope consumes the completed immutable validation cache.
    await completeJavaScriptAnalysisSteps(jsonValueValidationSteps(snapshot), signal);
    await reportEvidencePhase(progress, "hash_javascript_application_evidence", "Hashing the complete application analysis Evidence");
    const evidence = await completeJavaScriptAnalysisSteps(createImmutableEvidenceSteps(applicationSubject(snapshot), JAVASCRIPT_APPLICATION_PROVIDER, applicationObservation(input, snapshot)), signal);
    return rememberOwnedApplicationGraphEvidence(evidence, snapshot);
};
const reportEvidencePhase = (progress, phase, message) => progress?.report({ phase, completed: 0, total: 1, message }) ??
    Promise.resolve();
/** Create Evidence for one deterministic local JavaScript application graph. */
export const createJavaScriptApplicationEvidence = (input, result) => createEvidence(applicationSubject(result), JAVASCRIPT_APPLICATION_PROVIDER, applicationObservation(input, result));
const applicationSubject = (result) => ({
    path: result.input_path,
    sha256: result.root_artifact_sha256,
    format: result.format,
});
const applicationObservation = (input, result) => ({
    predicateType: "rea.javascript-application-analysis",
    operation: "analyze_javascript_application",
    parameters: parameters(input),
    result,
    rawResult: null,
    confidence: "derived",
    authority: "shipped-artifact",
    environment: null,
    limitations: result.limitations,
    locations: [{ kind: "artifact-path", path: "artifact-root" }],
});
const parameters = (input) => ({
    format: input.format,
});
