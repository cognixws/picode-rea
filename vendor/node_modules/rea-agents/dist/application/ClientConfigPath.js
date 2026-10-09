import { lstat, realpath } from "node:fs/promises";
const systemFileSystem = { lstat, realpath };
/**
 * Resolve an existing, user-owned config symlink to one stable transaction
 * path. Missing regular paths remain eligible for first-run creation.
 */
export const resolveClientConfigTransactionPath = async (requestedPath, fileSystem = systemFileSystem) => {
    let requestedStats;
    try {
        requestedStats = await fileSystem.lstat(requestedPath);
    }
    catch (cause) {
        return isMissing(cause) ? requestedPath : undefined;
    }
    if (!requestedStats.isSymbolicLink())
        return requestedPath;
    const currentUid = typeof process.getuid === "function" ? process.getuid() : undefined;
    if (currentUid === undefined ||
        requestedStats.uid !== currentUid ||
        fileSystem.realpath === undefined)
        return undefined;
    try {
        const canonicalPath = await fileSystem.realpath(requestedPath);
        const targetStats = await fileSystem.lstat(canonicalPath);
        return targetStats.isFile?.() === true && targetStats.uid === currentUid
            ? canonicalPath
            : undefined;
    }
    catch (cause) {
        // best-effort cleanup: unreadable or vanishing config paths mean no registration.
        void cause;
        return undefined;
    }
};
const isMissing = (cause) => cause instanceof Error && "code" in cause && cause.code === "ENOENT";
