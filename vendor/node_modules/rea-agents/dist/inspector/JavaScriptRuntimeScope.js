import { pathToFileURL } from "node:url";
import { browserOriginSchema, sanitizeBrowserUrl, } from "../domain/browserObservation.js";
import { AnalysisCancelledError } from "../domain/analysisErrorCore.js";
import { authorizedElectronFile } from "../browser/ElectronFileScope.js";
/** Throw the operation's typed cancellation error whenever its signal is aborted. */
export const throwIfRuntimeObservationCancelled = (signal) => {
    if (signal?.aborted === true)
        throw new AnalysisCancelledError("observe_javascript_runtime");
};
/**
 * Wire bucket for inspector script exclusions. The V8 observation schemas
 * fix the `unsupported_location` key, so every canonical denial reason maps
 * onto it; the reason itself stays available on the decision for logs and
 * limitations text.
 */
export const inspectorExclusionKey = (reason) => {
    // Every canonical denial collapses onto the fixed V8 wire bucket.
    void reason;
    return "unsupported_location";
};
/** Resolve a protocol location exposed by the explicitly selected Inspector endpoint. */
export const authorizeRuntimeLocation = async (value, signal) => {
    throwIfRuntimeObservationCancelled(signal);
    if (value.startsWith("node:") && value.length > 0)
        return {
            allowed: true,
            location: { kind: "builtin", specifier: value },
        };
    if (value.startsWith("file:")) {
        const filePath = await authorizedElectronFile(value);
        throwIfRuntimeObservationCancelled(signal);
        return filePath === undefined
            ? { allowed: false, reason: "not_approved" }
            : { allowed: true, location: { kind: "file", file_path: filePath } };
    }
    let url;
    try {
        url = new URL(value);
    }
    catch (cause) {
        // Non-URL input is outside the authorized runtime scope.
        void cause;
        return { allowed: false, reason: "unsupported_url" };
    }
    if (!["http:", "https:"].includes(url.protocol))
        return { allowed: false, reason: "unsupported_url" };
    const parsedOrigin = browserOriginSchema.safeParse(url.origin);
    if (!parsedOrigin.success)
        return { allowed: false, reason: "unsupported_url" };
    return {
        allowed: true,
        location: {
            kind: "url",
            origin: parsedOrigin.data,
            sanitized_url: sanitizeBrowserUrl(value).url,
        },
    };
};
/** Interpret Node's lossy discovery metadata separately from scriptParsed URLs. */
export const authorizeRuntimeTargetLocation = async (value, context) => {
    if (context.type !== "node" ||
        !/^node\.js\/v/iu.test(context.product) ||
        !value.startsWith("file://"))
        return authorizeRuntimeLocation(value);
    const reportedPath = value.slice("file://".length);
    if (!reportedPath.startsWith("/") && !/^[a-z]:[/\\_]/iu.test(reportedPath))
        return authorizeRuntimeLocation(value);
    // Node concatenates the pathname, then replaces quotes and backslashes with
    // underscores. A remaining underscore cannot prove which pathname was used.
    if (process.platform !== "win32" && !/[_"\\]/u.test(reportedPath)) {
        if (reportedPath.startsWith("/")) {
            const decision = await authorizeRuntimeLocation(pathToFileURL(reportedPath).href);
            if (decision.allowed)
                return decision;
        }
    }
    return {
        allowed: true,
        location: {
            kind: "unresolved",
            reported_url: value,
            reason: "unverifiable-file-location",
        },
    };
};
