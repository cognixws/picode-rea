import { AnalysisCancelledError } from "../domain/analysisErrorCore.js";
import { BrowserObservationError } from "../domain/browserObservationError.js";
import {} from "../domain/browserObservationErrors.js";
import { sanitizeBrowserUrl } from "../domain/browserObservation.js";
import { createWebTextArtifact } from "../domain/webContentArtifact.js";
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
export const recordValue = (value) => isRecord(value) ? value : undefined;
export const recordsValue = (value) => Array.isArray(value)
    ? value.flatMap((item) => {
        const record = recordValue(item);
        return record === undefined ? [] : [record];
    })
    : [];
export const cdpStringValue = (value) => typeof value === "string" ? value : undefined;
export const numberValue = (value) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
export const requiredRecord = (value) => {
    const record = recordValue(value);
    if (record === undefined)
        throw new BrowserObservationError("inspect_web_page", "protocol_error");
    return record;
};
export const isHttpUrl = (value) => {
    if (value === undefined)
        return false;
    try {
        const protocol = new URL(value).protocol;
        return protocol === "http:" || protocol === "https:";
    }
    catch (cause) {
        // Non-URL input is not an HTTP URL.
        void cause;
        return false;
    }
};
export const allowedSanitizedUrl = (value, allowedOrigins) => {
    const text = cdpStringValue(value);
    if (text === undefined)
        return undefined;
    const sanitized = sanitizeBrowserUrl(text);
    return sanitized.origin !== null && allowedOrigins.has(sanitized.origin)
        ? sanitized
        : undefined;
};
export const sourceResult = (source) => ({
    included: true,
    artifact: createWebTextArtifact(source, "text/javascript"),
});
export const sourceExcluded = (reason) => ({ included: false, reason });
export const delayWithCancellation = async (durationMs, operation, signal) => {
    const maximumTimerDelay = 2_147_483_647;
    let remaining = durationMs;
    while (remaining > 0) {
        if (signal?.aborted === true)
            throw new AnalysisCancelledError(operation);
        const delay = Math.min(remaining, maximumTimerDelay);
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                signal?.removeEventListener("abort", onAbort);
                resolve();
            }, delay);
            const onAbort = () => {
                clearTimeout(timer);
                signal?.removeEventListener("abort", onAbort);
                reject(new AnalysisCancelledError(operation));
            };
            signal?.addEventListener("abort", onAbort, { once: true });
            if (signal?.aborted === true)
                onAbort();
        });
        remaining -= delay;
    }
};
