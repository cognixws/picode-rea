import { open } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { once } from "node:events";
import { Reader, ZipReader } from "@zip.js/zip.js";
import { ArtifactReaderFailure, } from "./ArtifactReader.js";
class NodeFileReader extends Reader {
    path;
    #handle;
    constructor(path) {
        super(path);
        this.path = path;
    }
    async init() {
        this.#handle = await open(this.path, "r");
        this.size = (await this.#handle.stat()).size;
    }
    async readUint8Array(index, length) {
        const handle = this.#handle;
        if (handle === undefined)
            throw new Error("ZIP reader is not initialized");
        const bytes = Buffer.alloc(Math.min(length, this.size - index));
        const read = await handle.read(bytes, 0, bytes.length, index);
        return bytes.subarray(0, read.bytesRead);
    }
    async closeHandle() {
        await this.#handle?.close();
        this.#handle = undefined;
    }
}
/** Lazy Zip64-capable reader with CRC and overlap verification on every read. */
export class ZipArtifactReader {
    format;
    #source;
    #reader;
    #entries = new Map();
    constructor(path, format) {
        this.format = format;
        this.#source = new NodeFileReader(path);
        this.#reader = new ZipReader(this.#source, {
            checkSignature: true,
            checkOverlappingEntry: true,
            // REA applies its own provider-neutral path validation in scanReader and
            // must preserve that typed failure instead of zip.js rejecting first.
            filenameValidation: "tolerant",
        });
    }
    async *entries(signal) {
        for await (const entry of this.#reader.getEntriesGenerator()) {
            abortIfNeeded(signal);
            this.#entries.set(entry.filename, entry);
            const symlink = isSymlink(entry);
            yield {
                path: entry.filename,
                kind: entry.directory ? "directory" : symlink ? "symlink" : "file",
                declaredSize: entry.directory ? null : entry.uncompressedSize,
                compressedSize: entry.directory ? null : entry.compressedSize,
                executable: entry.executable,
                encrypted: entry.encrypted,
                byteOffset: null,
                declaredSha256: null,
                unpacked: false,
                limitations: symlink ? ["Archive symlink target was not read."] : [],
                adapterKey: entry.filename,
            };
        }
    }
    open(entry, signal) {
        abortIfNeeded(signal);
        const stored = this.#entries.get(entry.adapterKey);
        if (stored === undefined || stored.directory || isSymlink(stored))
            return Promise.reject(new ArtifactReaderFailure("format", "ZIP entry is not a regular file"));
        if (stored.encrypted)
            return Promise.reject(new ArtifactReaderFailure("unavailable", "Encrypted ZIP entry is unsupported"));
        return Promise.resolve(extractStream(stored, signal));
    }
    async close() {
        // best-effort cleanup: zip-reader close must not mask prior extraction state.
        await this.#reader.close().catch(() => undefined);
        await this.#source.closeHandle();
    }
    provenance() {
        return [];
    }
}
const extractStream = (entry, signal) => {
    const output = new PassThrough();
    const controller = new AbortController();
    const onAbort = () => {
        controller.abort(signal?.reason);
        // AbortSignal listeners dispatch synchronously, so this destroy wins the race
        // against `getData` rejecting with its own AbortError. That ordering is what
        // keeps the caller-visible failure typed as `cancelled`.
        output.destroy(new ArtifactReaderFailure("cancelled", "ZIP operation cancelled"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    // `close` covers both a consumer walking away mid-entry and normal completion
    // after `end()`; aborting then is harmless because `getData` has already
    // resolved, and it releases the producer in the abandoned-consumer case.
    output.once("close", () => {
        signal?.removeEventListener("abort", onAbort);
        controller.abort();
    });
    const writable = new WritableStream({
        write: async (chunk) => {
            abortIfNeeded(signal);
            if (!output.write(Buffer.from(chunk)))
                await once(output, "drain", { signal: controller.signal });
        },
        close: () => {
            output.end();
        },
        abort: (reason) => {
            output.destroy(toError(reason));
        },
    });
    void entry
        .getData(writable, {
        signal: controller.signal,
        checkSignature: true,
        checkOverlappingEntry: true,
        onprogress: () => abortIfNeeded(signal),
    })
        .catch((cause) => output.destroy(toError(cause)));
    return output;
};
const isSymlink = (entry) => entry.unixMode !== undefined && (entry.unixMode & 0o170000) === 0o120000;
const abortIfNeeded = (signal) => {
    if (signal?.aborted === true)
        throw new ArtifactReaderFailure("cancelled", "ZIP operation cancelled");
};
const toError = (cause) => cause instanceof Error ? cause : new Error("ZIP extraction failed");
