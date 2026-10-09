import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readlink, realpath } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { resolveTreePath } from "../../domain/apple/dyldPaths.js";
import { dylibResolutionInputSchema, dylibResolutionResultSchema, traceDylibLoading, } from "../../domain/apple/dylibResolution.js";
import { ArtifactReaderFailure } from "../ArtifactReader.js";
import { DirectoryArtifactReader } from "../DirectoryArtifactReader.js";
import { hasMachoMagic, readMachoImage } from "./MachoLoadCommandReader.js";
const HASH_CHUNK_BYTES = 1024 * 1024;
/** Lazily probed, symlink-preserving view of one analyzed directory. */
class FilesystemTreeView {
    root;
    signal;
    #entries = new Map();
    #images = new Map();
    #identities = new Map();
    constructor(root, signal) {
        this.root = root;
        this.signal = signal;
    }
    entry(path) {
        const cached = this.#entries.get(path);
        if (cached !== undefined)
            return cached;
        const pending = this.#readEntry(path);
        this.#entries.set(path, pending);
        return pending;
    }
    image(path) {
        const cached = this.#images.get(path);
        if (cached !== undefined)
            return cached;
        const pending = readImage(join(this.root, path), this.signal).then(({ facts, identity }) => {
            this.#identities.set(path, identity);
            return facts;
        });
        this.#images.set(path, pending);
        return pending;
    }
    /** Identity of the file whose header bytes `image()` parsed. */
    identity(path) {
        return this.#identities.get(path);
    }
    async #readEntry(path) {
        cancelled(this.signal);
        const absolute = join(this.root, path);
        try {
            const metadata = await lstat(absolute);
            if (metadata.isSymbolicLink())
                return { kind: "symlink", target: await readlink(absolute) };
            if (metadata.isDirectory())
                return { kind: "directory" };
            return metadata.isFile() ? { kind: "file" } : undefined;
        }
        catch (cause) {
            if (missing(cause))
                return undefined;
            throw cause;
        }
    }
}
/** Resolve dyld load paths for the active Mach-O or every executable in its bundle. */
export const traceDylibResolution = async (options) => {
    const parsed = dylibResolutionInputSchema.safeParse(options.parameters);
    if (!parsed.success)
        throw new ArtifactReaderFailure("path", "roots must be normalized paths relative to the analyzed root");
    // Canonicalization is inside the translated region: a revoked permission
    // keeps its reason and path.
    let root = options.rootPath;
    try {
        root = await realpath(options.rootPath);
        const target = relative(root, await realpath(options.targetPath))
            .split(sep)
            .join("/");
        const view = new FilesystemTreeView(root, options.signal);
        const { roots: requested, unclassified } = parsed.data.roots !== undefined
            ? { roots: parsed.data.roots, unclassified: [] }
            : options.enumerateRoots
                ? await executableRoots(root, view, options.signal)
                : { roots: [target], unclassified: [] };
        const roots = await requireMachoRoots(view, requested);
        const trace = await traceDylibLoading(view, {
            roots,
            unclassified,
            ...(parsed.data.architecture === undefined
                ? {}
                : { architecture: parsed.data.architecture }),
            ...(options.signal === undefined ? {} : { signal: options.signal }),
        });
        // Each digest must describe the same file whose headers were parsed.
        const digests = new Map();
        for (const { path } of trace.images)
            digests.set(path, await fileSha256(join(root, path), {
                path,
                expected: view.identity(path),
                ...(options.signal === undefined ? {} : { signal: options.signal }),
            }));
        const targetDigest = digests.get(target) ??
            (await fileSha256(join(root, target), {
                path: target,
                expected: undefined,
                ...(options.signal === undefined ? {} : { signal: options.signal }),
            }));
        if (targetDigest !== options.targetSha256)
            throw new ArtifactReaderFailure("integrity", `Active target digest changed: expected ${options.targetSha256}, observed ${targetDigest}`);
        return dylibResolutionResultSchema.parse({
            ...trace,
            root_path: options.rootPath,
            target_sha256: options.targetSha256,
            images: trace.images.map((image) => ({
                ...image,
                sha256: digests.get(image.path),
            })),
        });
    }
    catch (cause) {
        if (options.signal?.aborted === true)
            throw new ArtifactReaderFailure("cancelled", "Dylib resolution was cancelled", { cause });
        const denied = permissionDenied(cause);
        if (denied !== undefined)
            throw new ArtifactReaderFailure("unavailable", `Permission denied (${denied.code}) reading ${deniedPath(root, denied.path)}`, { cause });
        throw cause;
    }
};
/**
 * Every Mach-O in the bundle with an executable slice is its own process root.
 * Mach-O files that do not parse are returned separately: whether they are
 * executables is unknown, so they make coverage partial instead of vanishing.
 */
const executableRoots = async (root, view, signal) => {
    const roots = [];
    const unclassified = [];
    for await (const entry of new DirectoryArtifactReader(root).entries(signal)) {
        if (entry.kind !== "file" ||
            !(await startsWithMachoMagic(entry.adapterKey)))
            continue;
        const facts = await view.image(entry.path);
        if (facts.status === "malformed" || facts.status === "unsupported")
            unclassified.push(entry.path);
        else if (facts.status === "parsed" &&
            facts.slices.some(({ file_type: type }) => type === "execute"))
            roots.push(entry.path);
    }
    return {
        roots: roots.sort(compare),
        unclassified: unclassified.sort(compare),
    };
};
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
/**
 * Resolve each root segment by segment, as dependency candidates are, so a
 * symlink in an intermediate directory cannot lead outside the analyzed root.
 */
const requireMachoRoots = async (view, roots) => {
    const resolved = [];
    for (const path of roots) {
        const lookup = await resolveTreePath(view, path);
        if (lookup.kind === "escapes")
            throw new ArtifactReaderFailure("path", `Root ${path} resolves outside the analyzed root`);
        if (lookup.kind !== "file")
            throw new ArtifactReaderFailure("path", `Root ${path} is not a regular file in the analyzed root`);
        if ((await view.image(lookup.path)).status === "not-mach-o")
            throw new ArtifactReaderFailure("format", `Root ${path} is not a Mach-O image`);
        if (!resolved.includes(lookup.path))
            resolved.push(lookup.path);
    }
    return resolved;
};
const startsWithMachoMagic = async (path) => {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
        const buffer = new Uint8Array(4);
        const { bytesRead } = await handle.read(buffer, 0, 4, 0);
        return hasMachoMagic(buffer.subarray(0, bytesRead));
    }
    finally {
        await handle.close();
    }
};
const identityOf = (metadata) => [
    metadata.dev,
    metadata.ino,
    metadata.size,
    metadata.mtimeNs,
    metadata.ctimeNs,
].join(":");
const readImage = async (path, signal) => {
    cancelled(signal);
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
        const metadata = await handle.stat({ bigint: true });
        const size = Number(metadata.size);
        const facts = await readMachoImage(async (offset, length) => {
            cancelled(signal);
            const buffer = new Uint8Array(Math.max(0, Math.min(length, size - offset)));
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
            return buffer.subarray(0, bytesRead);
        }, size);
        return { facts, identity: identityOf(metadata) };
    }
    finally {
        await handle.close();
    }
};
/** Hash a file, failing if it is not the file (or the version) that was parsed. */
const fileSha256 = async (absolute, options) => {
    const { signal } = options;
    const handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    const unchanged = async () => {
        if (options.expected !== undefined &&
            identityOf(await handle.stat({ bigint: true })) !== options.expected)
            throw new ArtifactReaderFailure("integrity", `${options.path} changed while its dyld load commands were traced`);
    };
    try {
        await unchanged();
        const hash = createHash("sha256");
        const buffer = new Uint8Array(HASH_CHUNK_BYTES);
        for (;;) {
            cancelled(signal);
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
            if (bytesRead === 0)
                break;
            hash.update(buffer.subarray(0, bytesRead));
        }
        await unchanged();
        return hash.digest("hex");
    }
    finally {
        await handle.close();
    }
};
const cancelled = (signal) => {
    if (signal?.aborted === true)
        throw new ArtifactReaderFailure("cancelled", "Dylib resolution was cancelled");
};
/** A denied path relative to the analyzed root, or absolute when outside it. */
const deniedPath = (root, path) => {
    if (path === undefined)
        return "a file in the analyzed root";
    const inside = relative(root, path);
    return inside === "" || inside.startsWith("..") ? path : inside;
};
/** Host permission denials, kept distinct from malformed or missing files. */
const permissionDenied = (cause) => {
    if (!(cause instanceof Error) || !("code" in cause))
        return undefined;
    if (cause.code !== "EACCES" && cause.code !== "EPERM")
        return undefined;
    return {
        code: cause.code,
        path: "path" in cause && typeof cause.path === "string"
            ? cause.path
            : undefined,
    };
};
const missing = (cause) => cause instanceof Error &&
    "code" in cause &&
    (cause.code === "ENOENT" || cause.code === "ENOTDIR");
