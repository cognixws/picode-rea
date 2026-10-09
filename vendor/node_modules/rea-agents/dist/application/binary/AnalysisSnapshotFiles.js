import { parseAnalysisSnapshot, serializeAnalysisSnapshot, } from "../../domain/analysisSnapshot.js";
import { EvidenceFileError, EvidenceIntegrityError, } from "../../domain/evidenceErrors.js";
import { err, ok } from "../../domain/result.js";
import { readJsonFile, writeTextFile } from "../JsonFiles.js";
/** Read and validate an analysis snapshot from the caller's path. */
export const readAnalysisSnapshot = async (path) => {
    const loaded = await readJsonFile(path);
    if (!loaded.ok)
        return loaded;
    try {
        return ok(parseAnalysisSnapshot(loaded.value));
    }
    catch (cause) {
        return err(new EvidenceIntegrityError(snapshotValidationMessage(cause), { cause }));
    }
};
/** Atomically write a deterministic analysis snapshot to the caller's path. */
export const writeAnalysisSnapshot = async (snapshot, path, overwrite) => {
    let encoded;
    try {
        encoded = serializeAnalysisSnapshot(snapshot);
    }
    catch (cause) {
        return err(new EvidenceIntegrityError(snapshotValidationMessage(cause), { cause }));
    }
    return writeTextFile(encoded, path, overwrite);
};
const snapshotValidationMessage = (cause) => cause instanceof TypeError
    ? cause.message
    : "Analysis snapshot validation failed";
