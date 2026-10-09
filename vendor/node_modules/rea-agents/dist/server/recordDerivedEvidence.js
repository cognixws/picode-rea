import { ok } from "../domain/result.js";
/** Atomically record derived Evidence with an optional supported unknown. */
export const recordDerivedEvidence = (session, evidence, unknown) => {
    if (unknown !== undefined) {
        const recorded = session.recordEvidenceWithUnknown(evidence, unknown);
        return recorded.ok ? ok(evidence) : recorded;
    }
    const recorded = session.recordEvidence(evidence);
    return recorded.ok ? ok(evidence) : recorded;
};
