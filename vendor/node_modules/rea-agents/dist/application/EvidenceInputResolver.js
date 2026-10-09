import { EvidenceReferenceError } from "../domain/evidenceErrors.js";
import { err, ok } from "../domain/result.js";
/** Resolve an exact reference without selecting a target or running analysis. */
export const resolveEvidenceInput = (input, lookup) => {
    if (!("kind" in input))
        return ok(input);
    const record = lookup?.(input.evidence_id);
    if (record === undefined)
        return err(new EvidenceReferenceError(input.evidence_id, "missing", "Evidence retained in this session", null));
    if (record.evidence_id !== input.evidence_id)
        return err(new EvidenceReferenceError(input.evidence_id, "identity_mismatch", input.evidence_id, record.evidence_id));
    return ok(record);
};
/** Resolve an application's Evidence before its existing semantic validation. */
export const resolveApplicationEvidenceRequest = (input, lookup) => {
    const application = resolveEvidenceInput(input.application, lookup);
    if (!application.ok)
        return application;
    return ok({ ...input, application: application.value });
};
/** Resolve explicitly paired Evidence without guessing another session's record. */
export const resolvePairedEvidenceRequest = (input, lookup) => {
    const left = resolveEvidenceInput(input.left, lookup);
    if (!left.ok)
        return left;
    const right = resolveEvidenceInput(input.right, lookup);
    if (!right.ok)
        return right;
    return ok({ ...input, left: left.value, right: right.value });
};
