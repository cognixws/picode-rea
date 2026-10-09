import { parseEvidence } from "../../domain/evidence.js";
import { EvidenceIntegrityError } from "../../domain/evidenceErrors.js";
import { err, ok } from "../../domain/result.js";
const parseExpectedEvidence = (rawEvidence, expectedOperations) => {
    try {
        const evidence = rawEvidence.map(parseEvidence);
        for (const record of evidence)
            if (!expectedOperations.includes(record.operation) ||
                record.predicate_type !== "rea.analysis")
                throw new TypeError(`Expected ${expectedOperations.join(" or ")} Evidence, received ${record.operation}`);
        return ok(evidence);
    }
    catch (cause) {
        return err(new EvidenceIntegrityError(cause instanceof Error ? cause.message : "Invalid Evidence"));
    }
};
export const resolveManagedEvidence = (evidence) => parseExpectedEvidence([evidence], ["inspect_managed_members"]);
export const resolveManagedArtifactEvidence = (evidence) => parseExpectedEvidence([evidence], ["inspect_managed_artifact"]);
export const resolveManagedBoundaryEvidence = (evidence) => parseExpectedEvidence([evidence], ["inspect_managed_native_boundaries"]);
export const resolveNativeEvidence = (evidence) => {
    return parseExpectedEvidence(evidence, ["inspect_macho", "analyze_function"]);
};
export const sourceEvidence = (input) => [
    input.managed_artifact,
    input.managed_members,
    input.managed_native_boundaries,
].filter((evidence) => evidence !== undefined);
