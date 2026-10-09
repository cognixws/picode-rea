import { EvidenceIntegrityError } from "../domain/evidenceErrors.js";
import { ok } from "../domain/result.js";
/** Record source evidence in order, stopping at the first session rejection. */
export const recordSessionEvidenceSources = (recordEvidence, sources) => {
    for (const source of sources) {
        const recorded = recordEvidence?.(source);
        if (recorded !== undefined && !recorded.ok)
            return recorded;
    }
    return ok(null);
};
