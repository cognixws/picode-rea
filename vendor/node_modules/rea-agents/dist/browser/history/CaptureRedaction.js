const CREDENTIAL_HEADERS = new Set([
    "authorization",
    "proxy-authorization",
    "cookie",
    "set-cookie",
]);
/** Literal redaction and structural authentication exclusions preserve unrelated local evidence. */
export class CaptureRedaction {
    sensitiveValues;
    redactions = [];
    #sensitiveByteValues;
    constructor(sensitiveValues) {
        this.sensitiveValues = sensitiveValues;
        // An unpaired surrogate has no UTF-8 representation. Buffer.from would
        // invent replacement-character bytes and incorrectly discard real evidence.
        this.#sensitiveByteValues = sensitiveValues.flatMap((value) => {
            const encoded = Buffer.from(value, "utf8");
            return encoded.toString("utf8") === value ? [encoded] : [];
        });
    }
    /** Preserve exact text unless explicitly sensitive or known transport URL userinfo. */
    text(value, pointer, transportUrl = false) {
        let result = value;
        if (transportUrl) {
            const match = /^([\x00-\x20]*(?:[a-z][a-z0-9+.-]*:)?\/\/)([^/?#]*@)/i.exec(result);
            if (match !== null) {
                result = `${match[1]}${result.slice(match[0].length)}`;
                this.redactions.push({ pointer, reason: "transport-credential" });
            }
        }
        if (this.sensitiveValues.some((literal) => value.includes(literal) || result.includes(literal))) {
            this.redactions.push({ pointer, reason: "explicit-sensitive-value" });
            return null;
        }
        return result;
    }
    /** Remove a credential field's value without retaining its digest or encoded form. */
    credential(pointer) {
        this.redactions.push({ pointer, reason: "transport-credential" });
        return null;
    }
    /** Known HAR credential surfaces; unknown extensions are ordinary caller-selected evidence. */
    harCredential(pointer, parent) {
        return ((/^\/(request|response)\/headers\/\d+\/value$/.test(pointer) &&
            typeof parent.name === "string" &&
            CREDENTIAL_HEADERS.has(parent.name.toLowerCase())) ||
            /^\/(request|response)\/cookies\/\d+\/value$/.test(pointer));
    }
    /** Only actual request/redirect fields and known transport header URLs declare URL semantics. */
    harTransportUrl(pointer, parent) {
        return (pointer === "/request/url" ||
            pointer === "/response/redirectURL" ||
            (/^\/(request|response)\/headers\/\d+\/value$/.test(pointer) &&
                typeof parent?.name === "string" &&
                ["location", "referer", "origin"].includes(parent.name.toLowerCase())));
    }
    /** Preserve bytes unless an explicitly declared UTF-8 literal occurs in them. */
    sensitiveBytes(bytes) {
        return this.#sensitiveByteValues.some((value) => bytes.includes(value));
    }
}
/** Escape a producer property for an RFC 6901 location. */
export const capturePointer = (parent, key) => `${parent}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
/** Structural record guard does not duck-type number/byte sidecar markers. */
export const captureObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
