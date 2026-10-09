import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rm, } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { streamChunkToBuffer } from "./StreamBytes.js";
import { ArtifactPathRegistry, normalizeArtifactPath, } from "./ArtifactPaths.js";
import { ArtifactReaderFailure } from "./ArtifactReader.js";
/** Symlink-resistant materialization in an exclusively owned, initially absent tree. */
export class SafeOutputTree {
    platform;
    #registry = new ArtifactPathRegistry();
    #outputRoot;
    #published = false;
    #cleanup = {
        status: "not-required",
    };
    constructor(outputRoot, platform) {
        this.platform = platform;
        this.#outputRoot = outputRoot;
    }
    /**
     * Exclusively create the absent destination as this operation's owned tree.
     *
     * POSIX mode bits and directory `fchmod`/`fsync` have no Windows equivalent:
     * `mkdir` already applies the requested mode, so the redundant handle
     * `chmod` is skipped there to avoid an `EPERM` on the directory descriptor.
     */
    static async create(outputRoot, platform = process.platform) {
        if (!isAbsolute(outputRoot))
            throw new ArtifactReaderFailure("path", "Extraction output root must be absolute");
        const requested = resolve(outputRoot);
        const name = basename(requested);
        if (name === "." || name === "..")
            throw new ArtifactReaderFailure("path", "Invalid extraction output root");
        const parent = await realpath(dirname(requested)).catch((cause) => {
            throw new ArtifactReaderFailure("unavailable", "Extraction output parent is unavailable", { cause });
        });
        const canonicalOutput = join(parent, name);
        await mkdir(canonicalOutput, { mode: 0o700 }).catch((cause) => {
            if (isAlreadyExists(cause))
                throw new ArtifactReaderFailure("path", "Extraction output root already exists", { cause });
            throw cause;
        });
        try {
            if (platform !== "win32") {
                const stagingHandle = await open(canonicalOutput, constants.O_RDONLY | constants.O_DIRECTORY);
                try {
                    await stagingHandle.chmod(0o700);
                }
                finally {
                    await stagingHandle.close();
                }
            }
            return new SafeOutputTree(canonicalOutput, platform);
        }
        catch (cause) {
            await rm(canonicalOutput, { recursive: true, force: true });
            throw cause;
        }
    }
    get outputRoot() {
        return this.#outputRoot;
    }
    get cleanup() {
        return structuredClone(this.#cleanup);
    }
    /** Stream one regular file with exact byte and digest verification. */
    async write(relativePath, source, expectedSha256, signal) {
        this.#assertWritable();
        const path = normalizeArtifactPath(relativePath);
        this.#registry.add(path, "file");
        const destination = await this.#prepareParent(path);
        const handle = await open(destination, constants.O_CREAT |
            constants.O_EXCL |
            constants.O_WRONLY |
            constants.O_NOFOLLOW, 0o600).catch((cause) => {
            throw new ArtifactReaderFailure("path", `Could not exclusively create extraction path: ${path}`, { cause });
        });
        const hash = createHash("sha256");
        let bytes = 0;
        try {
            for await (const raw of source) {
                abortIfNeeded(signal);
                const chunk = streamChunkToBuffer(raw);
                bytes += chunk.length;
                hash.update(chunk);
                await writeAll(handle, chunk);
            }
            const sha256 = hash.digest("hex");
            if (sha256 !== expectedSha256)
                throw new ArtifactReaderFailure("integrity", `Extracted content disagrees with inventory: ${path}`);
            await handle.sync();
            await handle.close();
            const readback = await hashFile(destination, bytes, signal);
            if (readback.sha256 !== sha256 || readback.bytes !== bytes)
                throw new ArtifactReaderFailure("integrity", `Durable readback verification failed: ${path}`);
            return { relativePath: path, sha256, bytesWritten: bytes };
        }
        catch (cause) {
            // best-effort cleanup: file-handle close must not mask the write failure.
            await handle.close().catch(() => undefined);
            throw cause;
        }
    }
    /** Sync the owned output tree and prevent further writes through this instance. */
    async commit() {
        this.#assertWritable();
        // Windows has no directory fsync; file contents are already synced in write().
        if (this.platform === "win32") {
            this.#published = true;
            return;
        }
        const parent = await open(dirname(this.#outputRoot), constants.O_RDONLY | constants.O_DIRECTORY);
        let output;
        try {
            output = await open(this.#outputRoot, constants.O_RDONLY | constants.O_DIRECTORY);
            await output.sync();
            await parent.sync();
            this.#published = true;
        }
        catch (cause) {
            throw new ArtifactReaderFailure("path", "Could not durably sync extraction output", { cause });
        }
        finally {
            await Promise.allSettled([parent.close(), output?.close()]);
        }
    }
    /** Remove only this operation's unsealed tree and verify absence. */
    async rollback() {
        if (this.#published)
            return structuredClone(this.#cleanup);
        await rm(this.#outputRoot, { recursive: true, force: true });
        const absent = await isAbsent(this.#outputRoot);
        this.#cleanup = absent
            ? { status: "complete", residualPaths: [] }
            : {
                status: "incomplete",
                residualPaths: [basename(this.#outputRoot)],
            };
        if (!absent)
            throw new ArtifactReaderFailure("integrity", "Extraction output cleanup could not be verified");
        return structuredClone(this.#cleanup);
    }
    async #prepareParent(relativePath) {
        const parts = relativePath.split("/");
        const fileName = parts.pop();
        if (fileName === undefined)
            throw new ArtifactReaderFailure("path", "Invalid extraction path");
        let current = this.#outputRoot;
        for (const part of parts) {
            current = join(current, part);
            await mkdir(current, { mode: 0o700 }).catch((cause) => {
                if (!isAlreadyExists(cause))
                    throw cause;
            });
            const metadata = await lstat(current);
            if (!metadata.isDirectory() || metadata.isSymbolicLink())
                throw new ArtifactReaderFailure("path", `Unsafe extraction parent: ${relativePath}`);
        }
        return join(current, fileName);
    }
    #assertWritable() {
        if (this.#published)
            throw new ArtifactReaderFailure("integrity", "Extraction tree is already committed");
    }
}
const hashFile = async (path, maximum, signal) => {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const hash = createHash("sha256");
    let bytes = 0;
    try {
        for await (const raw of handle.createReadStream({ autoClose: false })) {
            abortIfNeeded(signal);
            const chunk = streamChunkToBuffer(raw);
            bytes += chunk.length;
            if (bytes > maximum)
                throw new ArtifactReaderFailure("integrity", "Readback exceeded the bytes written");
            hash.update(chunk);
        }
    }
    finally {
        await handle.close();
    }
    return { sha256: hash.digest("hex"), bytes };
};
const writeAll = async (handle, chunk) => {
    let offset = 0;
    while (offset < chunk.length) {
        const { bytesWritten } = await handle.write(chunk, offset, chunk.length - offset);
        if (bytesWritten === 0)
            throw new ArtifactReaderFailure("unavailable", "Extraction output stopped accepting bytes");
        offset += bytesWritten;
    }
};
const isAbsent = async (path) => lstat(path).then(() => false, (cause) => {
    if (isNotFound(cause))
        return true;
    throw cause;
});
const isNotFound = (cause) => cause instanceof Error && "code" in cause && cause.code === "ENOENT";
const isAlreadyExists = (cause) => cause instanceof Error && "code" in cause && cause.code === "EEXIST";
const abortIfNeeded = (signal) => {
    if (signal?.aborted === true)
        throw new ArtifactReaderFailure("cancelled", "Artifact extraction cancelled");
};
