import { describeEvidenceBundleFailure, describeValidationFailure, parseEvidenceBundle, } from "../domain/evidenceBundle.js";
import { EvidenceFileError, EvidenceIntegrityError, } from "../domain/evidenceErrors.js";
import { err, ok } from "../domain/result.js";
import { parseProcessCapture } from "../domain/process/processCapture.js";
import { bufferedJsonParts, canonicalJsonParts, } from "../domain/jsonSerialization.js";
import { readJsonFile, writeTextParts } from "./JsonFiles.js";
/** Read and validate an evidence bundle at the caller-supplied path. */
export const readEvidenceBundle = async (path) => {
    const loaded = await readJsonFile(path);
    if (!loaded.ok)
        return loaded;
    let bundle;
    try {
        bundle = parseEvidenceBundle(loaded.value);
    }
    catch (cause) {
        return err(new EvidenceIntegrityError("Evidence bundle validation failed", {
            cause,
            userMessage: describeEvidenceBundleFailure(loaded.value, cause),
        }));
    }
    for (const record of bundle.records) {
        if (record.predicate_type !== "rea.process-capture")
            continue;
        try {
            parseProcessCapture(record.normalized_result);
        }
        catch (cause) {
            return err(new EvidenceIntegrityError("Evidence bundle validation failed", {
                cause,
                userMessage: `Process capture record ${record.evidence_id} has an invalid normalized_result (${describeValidationFailure(cause)}). Recreate or re-export the bundle, then try again.`,
            }));
        }
    }
    return ok(bundle);
};
/** Atomically write deterministic evidence JSON at the caller-supplied path. */
export const writeEvidenceBundle = async (bundle, path, overwrite) => {
    let checked;
    try {
        checked = parseEvidenceBundle(bundle);
    }
    catch (cause) {
        return err(new EvidenceIntegrityError("Evidence bundle validation failed", {
            cause,
        }));
    }
    return writeTextParts(bufferedJsonParts(canonicalJsonParts(checked)), path, overwrite);
};
