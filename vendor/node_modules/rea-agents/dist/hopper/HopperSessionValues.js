import { HopperProtocolError } from "../domain/hopperErrors.js";
import { err, ok } from "../domain/result.js";
/** Validate the bridge identity and exact per-launch run identifier. */
export const parseHopperServerInfo = (value, expectedRunId) => {
    if (typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        value.name === "REA Hopper bridge" &&
        typeof value.version === "string" &&
        value.run_id === expectedRunId)
        return ok({ name: value.name, version: value.version });
    return err(new HopperProtocolError("Hopper bridge health result is invalid"));
};
/** Require confirmation that the REA bridge detached or its document closed. */
export const isHopperShutdownAcknowledgement = (value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return false;
    if (value.shutdown !== true)
        return false;
    return ((value.analysis_stopped === true && value.document_closed === true) ||
        (value.document_closed === false && value.document_retained === true));
};
/** Detect the verified Linux bridge response that requires group cleanup. */
export const isHopperCleanupRequired = (value) => typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    value.shutdown === true &&
    value.cleanup_required === true;
