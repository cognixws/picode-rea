import { BrowserObservationError } from "../domain/browserObservationError.js";
import { mainFrameUrl } from "./CdpCaptureDocuments.js";
import { allowedSanitizedUrl, delayWithCancellation, isHttpUrl, } from "./CdpCaptureValues.js";
/** Wait for the attached target's main frame to enter its approved origin. */
export const authorizedMainFrame = async ({ connection, sessionId, signal, allowedOrigins, operation, }) => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
        const result = await connection.send("Page.getFrameTree", {}, sessionId, signal);
        const url = mainFrameUrl(result);
        if (allowedSanitizedUrl(url, allowedOrigins) !== undefined)
            return result;
        if (isHttpUrl(url))
            throw new BrowserObservationError(operation, "target_not_allowed");
        await delayWithCancellation(25, operation, signal);
    }
    throw new BrowserObservationError(operation, "target_not_allowed");
};
