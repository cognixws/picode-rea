import { z } from "zod";
export { browserTargetListSchema, webPageInspectionSchema, } from "./browserObservationSchemas.js";
const parseExactOrigin = (value) => {
    let url;
    try {
        url = new URL(value);
    }
    catch (cause) {
        // Invalid input is represented by the undefined return.
        void cause;
        return undefined;
    }
    if ((url.protocol !== "http:" && url.protocol !== "https:") ||
        url.hostname.includes("*") ||
        url.username !== "" ||
        url.password !== "" ||
        url.pathname !== "/" ||
        url.search !== "" ||
        url.hash !== "")
        return undefined;
    return url.origin;
};
/** Exact normalized HTTP(S) authority used for browser observation scope. */
export const browserOriginSchema = z
    .string()
    .min(1)
    .transform((value, context) => {
    const origin = parseExactOrigin(value);
    if (origin === undefined) {
        context.addIssue({
            code: "custom",
            message: "Expected one exact HTTP(S) origin without a path or wildcard",
        });
        return z.NEVER;
    }
    return origin;
});
/** Recognize the URL API's bracketed IPv6 form and normalized bare literals. */
export const isLiteralLoopbackHostname = (hostname) => hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
/** Loopback-only HTTP endpoint accepted for a user-owned CDP browser. */
export const browserEndpointSchema = z
    .string()
    .min(1)
    .transform((value, context) => {
    let url;
    try {
        url = new URL(value);
    }
    catch (cause) {
        // Invalid input is reported through the zod issue.
        void cause;
        context.addIssue({ code: "custom", message: "Invalid CDP endpoint URL" });
        return z.NEVER;
    }
    if (url.protocol !== "http:" ||
        !isLiteralLoopbackHostname(url.hostname) ||
        url.port === "" ||
        url.username !== "" ||
        url.password !== "" ||
        url.pathname !== "/" ||
        url.search !== "" ||
        url.hash !== "") {
        context.addIssue({
            code: "custom",
            message: "CDP endpoint must be an explicit-port HTTP URL on 127.0.0.1 or ::1",
        });
        return z.NEVER;
    }
    return url.origin;
});
export const browserAllowedOriginsSchema = z
    .array(browserOriginSchema)
    .transform((origins) => Array.from(new Set(origins)).sort())
    .default([]);
const browserInput = {
    cdp_endpoint: browserEndpointSchema,
    allowed_origins: browserAllowedOriginsSchema,
};
/** Public input for complete discovery, optionally filtered by exact origin. */
export const listBrowserTargetsInputSchema = z.strictObject({
    ...browserInput,
});
const inspectWebPageInputFacts = {
    ...browserInput,
    target_id: z.string().trim().min(1),
    observation_ms: z.number().int().min(0).default(500),
    include_accessibility_text: z.boolean().default(false),
    include_console_text: z.boolean().default(false),
    include_json_body_shapes: z.boolean().default(false),
    include_websocket_shapes: z.boolean().default(false),
    include_storage_keys: z.boolean().default(false),
    include_storage_fingerprints: z.boolean().default(false),
};
const inspectWebPageWithoutSourceSchema = z.strictObject({
    ...inspectWebPageInputFacts,
    include_script_sources: z.literal(false).default(false),
});
const inspectWebPageWithSourceShapeSchema = z.strictObject({
    ...inspectWebPageInputFacts,
    include_script_sources: z.literal(true).default(true),
});
const refineInspectWebPageInput = (input, context) => {
    if (input.include_storage_fingerprints && !input.include_storage_keys)
        context.addIssue({
            code: "custom",
            path: ["include_storage_fingerprints"],
            message: "Storage fingerprints require storage key capture",
        });
};
/** Caller schema for source-capturing inspection and bundle analysis. */
export const inspectWebPageWithSourceInputSchema = inspectWebPageWithSourceShapeSchema.superRefine(refineInspectWebPageInput);
/** Caller-visible schema for one passive inspection. */
export const inspectWebPageInputSchema = z.union([
    inspectWebPageWithoutSourceSchema.superRefine(refineInspectWebPageInput),
    inspectWebPageWithSourceInputSchema,
]);
export const sanitizedBrowserUrlSchema = z.object({
    url: z.string(),
    origin: z.string().nullable(),
    query_parameter_names: z.array(z.string()),
    redacted: z.boolean(),
});
/** Preserve local URL data while removing only URL userinfo credentials. */
export const sanitizeBrowserUrl = (value) => {
    let parsed;
    try {
        parsed = new URL(value);
    }
    catch (cause) {
        // Unparseable input is preserved verbatim in the sanitized result.
        void cause;
        return {
            url: value,
            origin: null,
            query_parameter_names: [],
            redacted: false,
        };
    }
    const hadCredentials = parsed.username !== "" || parsed.password !== "";
    const names = [...parsed.searchParams.keys()];
    const sanitizedUrl = hadCredentials
        ? removeUrlUserInfo(value, parsed)
        : value;
    return {
        url: sanitizedUrl,
        origin: parsed.origin === "null" ? null : parsed.origin,
        query_parameter_names: names,
        redacted: hadCredentials,
    };
};
const removeUrlUserInfo = (value, parsed) => {
    const schemeSeparator = value.indexOf("://");
    const authorityStart = schemeSeparator < 0
        ? value.startsWith("//")
            ? 2
            : -1
        : schemeSeparator + 3;
    if (authorityStart < 0)
        return credentialFreeHref(parsed);
    const remaining = value.slice(authorityStart);
    const delimiter = remaining.search(/[/?#]/u);
    const authorityEnd = delimiter < 0 ? value.length : authorityStart + delimiter;
    const authority = value.slice(authorityStart, authorityEnd);
    const userInfoEnd = authority.lastIndexOf("@");
    if (userInfoEnd < 0)
        return credentialFreeHref(parsed);
    const candidate = `${value.slice(0, authorityStart)}${authority.slice(userInfoEnd + 1)}${value.slice(authorityEnd)}`;
    try {
        const candidateUrl = new URL(candidate);
        return candidateUrl.username === "" && candidateUrl.password === ""
            ? candidate
            : credentialFreeHref(parsed);
    }
    catch (cause) {
        // Fallback to the already-sanitized href when the candidate is invalid.
        void cause;
        return credentialFreeHref(parsed);
    }
};
const credentialFreeHref = (parsed) => {
    parsed.username = "";
    parsed.password = "";
    return parsed.href;
};
/** Normalize endpoint candidates without discarding local query or fragment data. */
export const sanitizeEndpointCandidate = (value) => {
    return sanitizeBrowserUrl(value).url;
};
