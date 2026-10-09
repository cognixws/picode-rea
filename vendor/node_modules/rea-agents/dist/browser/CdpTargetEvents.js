import { cdpStringValue, recordValue } from "./CdpCaptureValues.js";
/** Match ordinary session envelopes and root detachment's parameter-scoped session identity. */
export const cdpTargetEventMatches = (event, sessionId) => {
    if (event.method !== "Target.detachedFromTarget")
        return event.sessionId === sessionId;
    return (sessionId !== undefined &&
        cdpStringValue(recordValue(event.params)?.sessionId) === sessionId);
};
