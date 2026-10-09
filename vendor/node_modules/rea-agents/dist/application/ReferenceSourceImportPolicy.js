import { readFile, realpath, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import ignore from "ignore";
import { err, ok } from "../domain/result.js";
import { DEFAULT_REFERENCE_SOURCE_IGNORE_PATTERNS, } from "./ReferenceSourceImportTypes.js";
const failure = (code, message) => ({
    tag: "reference-source-import",
    code,
    message,
});
const resolveRoot = async (requestedRoot) => {
    try {
        if (!(await stat(requestedRoot)).isDirectory())
            return err(failure("invalid-root", "Reference source root is not a directory"));
        const canonicalRoot = await realpath(resolve(requestedRoot));
        return ok(canonicalRoot);
    }
    catch (cause) {
        void cause;
        return err(failure("invalid-root", "Reference source root could not be resolved"));
    }
};
const buildIgnored = async (root, excludePaths) => {
    const ignored = ignore();
    try {
        ignored.add(await readFile(join(root, ".gitignore"), "utf8"));
    }
    catch (cause) {
        // Missing or unreadable ignore file does not authorize broader access.
        void cause;
    }
    ignored.add([...DEFAULT_REFERENCE_SOURCE_IGNORE_PATTERNS]);
    for (const path of excludePaths) {
        ignored.add(path);
        ignored.add(`${path}/`);
    }
    return ignored;
};
/** Resolve the caller-selected directory and build path filters. */
export const prepareReferenceSourceImport = async (options) => {
    const root = await resolveRoot(options.root);
    if (!root.ok)
        return root;
    return ok({
        root: root.value,
        ignored: await buildIgnored(root.value, options.excludePaths ?? []),
        secrets: ignore().add([...options.policy.secretPatterns]),
    });
};
