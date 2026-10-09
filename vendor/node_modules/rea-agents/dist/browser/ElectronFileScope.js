import { realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
/** Resolve one local file URL while rejecting remote hosts and encoded separators. */
export const authorizedElectronFile = async (value) => {
    if (/%(?:2f|5c)/iu.test(value))
        return undefined;
    let url;
    try {
        url = new URL(value);
    }
    catch (cause) {
        // Non-URL input cannot authorize a local file.
        void cause;
        return undefined;
    }
    if (url.protocol !== "file:" ||
        url.hostname !== "" ||
        url.username !== "" ||
        url.password !== "")
        return undefined;
    let path;
    try {
        path = fileURLToPath(url);
    }
    catch (cause) {
        // Unconvertible file URLs cannot authorize a local file.
        void cause;
        return undefined;
    }
    if (!isAbsolute(path) || path.includes("\0"))
        return undefined;
    let canonical;
    try {
        if (!(await stat(path)).isFile())
            return undefined;
        canonical = await realpath(path);
    }
    catch (cause) {
        // Missing or unreadable files cannot authorize a local file.
        void cause;
        return undefined;
    }
    return canonical;
};
