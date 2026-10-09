import { createHash } from "node:crypto";
import { AnalysisCancelledError, AnalysisTimeoutError, } from "../../domain/analysisErrorCore.js";
import { withPlaywrightExecutionBoundary } from "../PlaywrightExecutionBoundary.js";
const credentialHeaders = new Set([
    "authorization",
    "proxy-authorization",
    "cookie",
    "set-cookie",
]);
const errorMessage = (cause, secrets) => secrets.redact(cause instanceof Error && cause.message !== ""
    ? cause.message
    : "Network read failed");
/** Read actual producer headers without flattening duplicates or exposing credentials. */
export const captureNetworkHeaders = async (source, secrets, options) => {
    try {
        const headers = await withPlaywrightExecutionBoundary(() => source.headersArray(), options.timeoutMs, options.signal);
        return {
            state: "captured",
            items: headers.map(({ name, value }) => {
                const safeName = secrets.redact(name);
                const credential = credentialHeaders.has(name.toLowerCase());
                const safeValue = credential
                    ? null
                    : secrets.redactBytes(Buffer.from(value)).toString("utf8");
                return {
                    name: safeName,
                    value: safeValue,
                    redacted: credential || safeName !== name || safeValue !== value,
                };
            }),
        };
    }
    catch (cause) {
        return { state: "unavailable", message: errorMessage(cause, secrets) };
    }
};
/** Retain only bytes exposed by the browser; no fetch or wire-byte reconstruction occurs. */
export const captureNetworkBody = async (read, phase, source, secrets, options) => {
    try {
        const observed = await withPlaywrightExecutionBoundary(read, options.timeoutMs, options.signal);
        if (observed === null)
            return { state: "not_exposed" };
        const retained = secrets.redactBytes(observed);
        const contentType = source.headers()["content-type"];
        return {
            state: "captured",
            representation: phase === "request"
                ? "browser-exposed-request-bytes"
                : "browser-decoded-response-bytes",
            encoding: "base64",
            content: retained.toString("base64"),
            bytes: retained.length,
            sha256: createHash("sha256").update(retained).digest("hex"),
            media_type: contentType === undefined
                ? null
                : secrets.redactBytes(Buffer.from(contentType)).toString("utf8"),
            redacted: !retained.equals(observed),
        };
    }
    catch (cause) {
        return {
            state: "unavailable",
            reason: cause instanceof AnalysisCancelledError
                ? "cancelled"
                : cause instanceof AnalysisTimeoutError
                    ? "body-read-timeout"
                    : "body-read-failed",
            message: errorMessage(cause, secrets),
        };
    }
};
