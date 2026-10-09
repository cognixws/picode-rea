import { parseEvidence } from "../evidence.js";
/**
 * Parse managed inspection Evidence and bind its artifact to any available subject.
 * A null subject remains valid and means there is no digest to cross-check.
 */
export const parseManagedInspectionEvidence = (rawEvidence, operation, schema) => {
    const evidence = parseEvidence(rawEvidence);
    if (evidence.operation !== operation)
        throw new TypeError(`Evidence operation is not ${operation}`);
    const result = schema.parse(evidence.normalized_result);
    const artifactSha256 = result.artifact.sha256;
    const subjectSha256 = evidence.subject?.digest.sha256;
    if (subjectSha256 !== undefined && artifactSha256 !== subjectSha256)
        throw new TypeError(`Managed Evidence ${operation} (${evidence.evidence_id}) subject SHA-256 ${subjectSha256} does not match normalized artifact SHA-256 ${artifactSha256}`);
    return { evidence, result };
};
