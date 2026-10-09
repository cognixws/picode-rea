import { isHttpUrl, numberValue, recordValue, recordsValue, cdpStringValue, } from "./CdpCaptureValues.js";
/** Identify a top-level navigation event from its untrusted CDP envelope. */
export const isMainFrameNavigation = (event, mainFrameId) => {
    const params = recordValue(event.params);
    if (params === undefined)
        return false;
    const frameId = event.method === "Page.frameNavigated"
        ? cdpStringValue(recordValue(params.frame)?.id)
        : event.method === "Page.frameRequestedNavigation" ||
            event.method === "Page.navigatedWithinDocument"
            ? cdpStringValue(params.frameId)
            : undefined;
    return frameId === mainFrameId;
};
export const firstCallFrame = (value) => recordsValue(value?.callFrames)[0];
export const initiatorLocation = (initiator) => {
    let stack = recordValue(initiator?.stack);
    for (let depth = 0; depth < 32 && stack !== undefined; depth += 1) {
        const frame = firstCallFrame(stack);
        if (frame !== undefined)
            return frame;
        stack = recordValue(stack.parent);
    }
    return cdpStringValue(initiator?.url) === undefined ? undefined : initiator;
};
export const exclusionReasonForUrl = (value) => value === undefined || value === ""
    ? "unattributed_origin"
    : isHttpUrl(value)
        ? "disallowed_origin"
        : "unsupported_url";
export const integerOrNull = (value) => {
    const number = numberValue(value);
    return number === undefined ? null : Math.max(0, Math.trunc(number));
};
export const executionContextKey = (value) => {
    const identifier = numberValue(value);
    return identifier !== undefined && Number.isSafeInteger(identifier)
        ? String(identifier)
        : null;
};
export const isJsonContentType = (headers) => {
    if (headers === undefined)
        return false;
    for (const [name, value] of Object.entries(headers))
        if (name.toLowerCase() === "content-type" &&
            isJsonMediaType(cdpStringValue(value)))
            return true;
    return false;
};
export const isJsonMediaType = (value) => {
    const mediaType = value?.split(";", 1)[0]?.trim().toLowerCase();
    return (mediaType === "application/json" || mediaType?.endsWith("+json") === true);
};
export const consolePrimitive = (value) => {
    const type = cdpStringValue(value.type);
    switch (type) {
        case "string":
            return typeof value.value === "string"
                ? { type, text: value.value }
                : undefined;
        case "boolean":
            return typeof value.value === "boolean"
                ? { type, text: String(value.value) }
                : undefined;
        case "number":
            return typeof value.value === "number"
                ? { type, text: String(value.value) }
                : typeof value.unserializableValue === "string"
                    ? { type, text: value.unserializableValue }
                    : undefined;
        case "bigint":
            return typeof value.unserializableValue === "string"
                ? { type, text: value.unserializableValue }
                : undefined;
        case "undefined":
            return { type, text: "undefined" };
        default:
            return undefined;
    }
};
const BASE64 = /^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/u;
export const decodeBase64 = (value) => value.length % 4 === 0 && BASE64.test(value)
    ? Buffer.from(value, "base64")
    : undefined;
