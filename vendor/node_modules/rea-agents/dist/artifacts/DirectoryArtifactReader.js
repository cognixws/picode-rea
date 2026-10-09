import { constants } from "node:fs";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { ArtifactReaderFailure, } from "./ArtifactReader.js";
/** Deterministic, non-symlink-following directory reader. */
export class DirectoryArtifactReader {
    format = "directory";
    #rootPromise;
    #rootPath;
    constructor(root) {
        this.#rootPath = root;
        this.#rootPromise = realpath(root);
    }
    async *entries(signal) {
        const root = await this.#rootPromise.catch((cause) => {
            throw directoryIoFailure("resolve artifact root", this.#rootPath, cause);
        });
        const pending = [root];
        while (pending.length > 0) {
            abortIfNeeded(signal);
            const directory = pending.pop();
            if (directory === undefined)
                break;
            await withDirectoryIoContext("inspect directory", directory, () => assertContainedDirectory(root, directory));
            const children = [];
            const handle = await opendir(directory).catch((cause) => {
                throw directoryIoFailure("open directory", directory, cause);
            });
            try {
                for await (const child of handle)
                    children.push(child.name);
            }
            catch (cause) {
                throw directoryIoFailure("read directory", directory, cause);
            }
            finally {
                // best-effort cleanup: directory-handle close must not mask traversal.
                await handle.close().catch(() => undefined);
            }
            await withDirectoryIoContext("inspect directory", directory, () => assertContainedDirectory(root, directory));
            children.sort((left, right) => left.localeCompare(right, "en"));
            const directories = [];
            for (const name of children) {
                abortIfNeeded(signal);
                const absolute = join(directory, name);
                const metadata = await lstat(absolute).catch((cause) => {
                    throw directoryIoFailure("inspect entry", absolute, cause);
                });
                const path = relative(root, absolute).split(sep).join("/");
                const kind = metadata.isSymbolicLink()
                    ? "symlink"
                    : metadata.isDirectory()
                        ? "directory"
                        : metadata.isFile()
                            ? "file"
                            : undefined;
                if (kind === undefined)
                    continue;
                if (kind === "directory")
                    directories.push(absolute);
                yield {
                    path,
                    kind,
                    declaredSize: kind === "file" ? metadata.size : null,
                    compressedSize: null,
                    executable: (metadata.mode & 0o111) !== 0,
                    encrypted: false,
                    byteOffset: null,
                    declaredSha256: null,
                    unpacked: false,
                    limitations: kind === "symlink"
                        ? ["Symlink target was not followed or disclosed."]
                        : [],
                    adapterKey: absolute,
                    ...(kind === "file"
                        ? { sourceIdentity: { device: metadata.dev, inode: metadata.ino } }
                        : {}),
                };
            }
            directories.reverse();
            pending.push(...directories);
        }
    }
    async open(entry, signal) {
        abortIfNeeded(signal);
        if (entry.kind !== "file")
            throw new ArtifactReaderFailure("format", "Only regular files can be opened");
        const handle = await open(entry.adapterKey, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch((cause) => {
            throw directoryIoFailure("open entry", entry.adapterKey, cause);
        });
        try {
            const observed = await handle.stat().catch((cause) => {
                throw directoryIoFailure("inspect opened entry", entry.adapterKey, cause);
            });
            if (!observed.isFile() ||
                entry.sourceIdentity === undefined ||
                observed.dev !== entry.sourceIdentity.device ||
                observed.ino !== entry.sourceIdentity.inode) {
                throw new ArtifactReaderFailure("integrity", `Directory entry changed before open: ${entry.path}`);
            }
            return handle.createReadStream({ autoClose: true });
        }
        catch (cause) {
            // best-effort cleanup: file-handle close must not mask the open failure.
            await handle.close().catch(() => undefined);
            throw cause;
        }
    }
    close() {
        return Promise.resolve();
    }
    provenance() {
        return [];
    }
}
const directoryIoFailure = (operation, path, cause) => {
    if (cause instanceof ArtifactReaderFailure)
        return cause;
    const code = typeof cause === "object" &&
        cause !== null &&
        "code" in cause &&
        typeof cause.code === "string"
        ? ` (${cause.code})`
        : "";
    return new ArtifactReaderFailure("io", `Could not ${operation} at ${path}${code}`, { cause });
};
const withDirectoryIoContext = async (operation, path, action) => {
    try {
        return await action();
    }
    catch (cause) {
        throw directoryIoFailure(operation, path, cause);
    }
};
const abortIfNeeded = (signal) => {
    if (signal?.aborted === true)
        throw new ArtifactReaderFailure("cancelled", "Artifact traversal cancelled");
};
const assertContainedDirectory = async (root, directory) => {
    const canonical = await realpath(directory);
    const fromRoot = relative(root, canonical);
    const metadata = await lstat(directory);
    if (metadata.isSymbolicLink() ||
        !metadata.isDirectory() ||
        fromRoot === ".." ||
        fromRoot.startsWith(`..${sep}`) ||
        isAbsolute(fromRoot))
        throw new ArtifactReaderFailure("path", "Directory traversal escaped or changed its artifact root");
};
