import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, open, readdir, readlink } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
const hasSameIdentity = (before, after, expected) => before.dev === after.dev &&
    before.ino === after.ino &&
    (expected === "directory" ? after.isDirectory() : after.isSymbolicLink());
const hasSameFileState = (before, after) => before.dev === after.dev &&
    before.ino === after.ino &&
    before.isFile() &&
    after.isFile() &&
    before.mode === after.mode &&
    before.size === after.size &&
    before.mtimeMs === after.mtimeMs &&
    before.ctimeMs === after.ctimeMs;
const lstatIfPresent = async (path) => {
    try {
        return await lstat(path);
    }
    catch (cause) {
        if (cause instanceof Error && "code" in cause && cause.code === "ENOENT")
            return undefined;
        throw cause;
    }
};
/** Hash a file only when its opened descriptor still matches the captured path state. */
export const hashFile = async (path, expected, maxBytes, signal) => {
    signal?.throwIfAborted();
    const handle = await open(path, fsConstants.O_RDONLY |
        (fsConstants.O_NOFOLLOW ?? 0) |
        (fsConstants.O_NONBLOCK ?? 0));
    try {
        signal?.throwIfAborted();
        const stats = await handle.stat();
        signal?.throwIfAborted();
        if (!hasSameFileState(expected, stats) || stats.size > maxBytes)
            return null;
        const hash = createHash("sha256");
        const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes));
        let position = 0;
        while (position < stats.size) {
            signal?.throwIfAborted();
            const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, stats.size - position), position);
            if (bytesRead === 0)
                return null;
            hash.update(buffer.subarray(0, bytesRead));
            position += bytesRead;
        }
        const after = await handle.stat();
        signal?.throwIfAborted();
        if (!hasSameFileState(stats, after))
            return null;
        return hash.digest("hex");
    }
    finally {
        await handle.close();
    }
};
/** Capture bounded, root-aliased filesystem state without following symlinks. */
export const snapshotRoots = async (scenario, signal) => {
    const entries = [];
    let remainingBytes = scenario.limits.file_bytes;
    let truncated = false;
    const visit = async (root, rootAlias, path, depth) => {
        signal?.throwIfAborted();
        if (entries.length >= scenario.limits.files ||
            depth > scenario.limits.filesystem_depth) {
            truncated = true;
            return;
        }
        const stats = await lstatIfPresent(path);
        if (stats === undefined)
            return;
        const relativePath = relative(root, path) || ".";
        if (stats.isSymbolicLink()) {
            const target = resolve(dirname(path), await readlink(path));
            const afterRead = await lstat(path);
            if (!hasSameIdentity(stats, afterRead, "symlink")) {
                truncated = true;
                return;
            }
            entries.push({
                path: `${rootAlias}:${relativePath}`,
                type: "symlink",
                mode: stats.mode,
                size: stats.size,
                sha256: null,
                symlink_target: target,
            });
            return;
        }
        if (stats.isFile()) {
            const sha256 = remainingBytes >= stats.size
                ? await hashFile(path, stats, remainingBytes, signal)
                : null;
            remainingBytes -= sha256 === null ? 0 : stats.size;
            if (sha256 === null)
                truncated = true;
            entries.push({
                path: `${rootAlias}:${relativePath}`,
                type: "file",
                mode: stats.mode,
                size: stats.size,
                sha256,
                symlink_target: null,
            });
            return;
        }
        const type = stats.isDirectory() ? "directory" : "other";
        entries.push({
            path: `${rootAlias}:${relativePath}`,
            type,
            mode: stats.mode,
            size: stats.size,
            sha256: null,
            symlink_target: null,
        });
        if (type !== "directory")
            return;
        const children = await readdir(path);
        const afterRead = await lstat(path);
        if (!hasSameIdentity(stats, afterRead, "directory")) {
            truncated = true;
            return;
        }
        for (const child of children.sort())
            await visit(root, rootAlias, join(path, child), depth + 1);
    };
    for (const [index, root] of scenario.filesystem_observation_paths.entries()) {
        if ((await lstatIfPresent(root)) === undefined) {
            truncated = true;
            continue;
        }
        await visit(root, `root_${String(index)}`, root, 0);
    }
    return { files: entries, truncated };
};
