import { win32 } from "node:path";
import { z } from "zod";
import { requireWindowsNativeAuthority, windowsFileIdentitySchema, windowsHandleSchema, } from "./WindowsNativeLoader.js";
const runtimeSchema = windowsFileIdentitySchema.extend({
    path: z.string(),
    handle: windowsHandleSchema,
    privateDacl: z.literal(true),
});
const snapshotSchema = z.strictObject({
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    source: windowsFileIdentitySchema,
    snapshot: windowsFileIdentitySchema,
});
const fileSchema = windowsFileIdentitySchema.extend({
    handle: windowsHandleSchema,
});
const runtimes = new Map();
/** Retain private DACL and path handles until native recursive cleanup settles. */
export class WindowsPrivateRuntime {
    observation;
    authority;
    // One native snapshot can own cancellation for this runtime at a time. A
    // second request throws ERROR_BUSY before #pending or its abort listener is
    // replaced, so aborting a rejected request cannot cancel the accepted copy.
    #pending;
    #closed = false;
    #closePromise;
    constructor(observation, authority) {
        this.observation = observation;
        this.authority = authority;
    }
    /** Create a new directory with its private DACL installed at creation. */
    static create(parent, prefix) {
        const authority = requireWindowsNativeAuthority();
        const observation = runtimeSchema.parse(authority.call("runtime_create", [parent, prefix]));
        const runtime = new WindowsPrivateRuntime(observation, authority);
        runtimes.set(observation.path.toLowerCase(), runtime);
        return runtime;
    }
    /** Open a private child directory through retained, verified parent handles. */
    mkdir(relativePath) {
        this.authority.call("runtime_mkdir", [
            this.observation.handle,
            relativePath,
        ]);
    }
    /** Write a new private file once and retain its immutable handle. */
    writeFile(relativePath, content) {
        this.authority.call("runtime_write", [
            this.observation.handle,
            relativePath,
            Buffer.from(content),
        ]);
    }
    /** Copy admitted source bytes and digest the bytes actually written. */
    async snapshot(sourcePath, relativePath, signal) {
        // Admission is synchronous; record ownership only after native acceptance.
        const pending = Promise.resolve(this.authority.call("runtime_snapshot", [
            this.observation.handle,
            sourcePath,
            relativePath,
        ]));
        this.#pending = pending;
        const cancel = () => {
            this.authority.call("runtime_snapshot_cancel", [this.observation.handle]);
        };
        signal?.addEventListener("abort", cancel, { once: true });
        if (signal?.aborted === true)
            cancel();
        try {
            return snapshotSchema.parse(await pending);
        }
        finally {
            signal?.removeEventListener("abort", cancel);
            if (this.#pending === pending)
                this.#pending = undefined;
        }
    }
    /** Read a private endpoint from an opened file, without re-opening its path. */
    readFile(relativePath) {
        const file = fileSchema.parse(this.authority.call("runtime_open", [
            this.observation.handle,
            relativePath,
        ]));
        try {
            const chunks = [];
            for (let offset = 0; offset < file.size;) {
                const value = z
                    .instanceof(Buffer)
                    .parse(this.authority.call("read", [
                    file.handle,
                    offset,
                    Math.min(65_536, file.size - offset),
                ]));
                if (value.length === 0)
                    throw new Error("Private runtime file ended before its observed size");
                offset += value.length;
                chunks.push(value);
            }
            return Buffer.concat(chunks).toString("utf8");
        }
        finally {
            this.authority.call("close", [file.handle]);
        }
    }
    /** Remove owned objects by handle, unlinking reparse entries without traversal. */
    close() {
        this.#closePromise ??= this.#remove();
        return this.#closePromise;
    }
    async #remove() {
        if (this.#closed)
            return;
        if (this.#pending !== undefined)
            this.authority.call("runtime_snapshot_cancel", [this.observation.handle]);
        await this.#pending?.catch(() => undefined);
        try {
            this.authority.call("runtime_close", [this.observation.handle]);
        }
        finally {
            this.#closed = true;
            runtimes.delete(this.observation.path.toLowerCase());
        }
    }
}
/** Select an already-owned runtime; an arbitrary pathname cannot grant authority. */
export const windowsPrivateRuntime = (rootPath) => {
    const runtime = runtimes.get(rootPath.toLowerCase());
    if (runtime === undefined)
        throw new Error(`No native private runtime owns ${rootPath}`);
    return runtime;
};
/** Read a runtime endpoint using the lease that owns its parent directory. */
export const readWindowsPrivateRuntimeFile = (path) => {
    const parent = win32.dirname(path);
    return windowsPrivateRuntime(parent).readFile(win32.basename(path));
};
