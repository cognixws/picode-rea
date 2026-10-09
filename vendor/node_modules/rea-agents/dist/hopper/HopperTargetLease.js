import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, realpath, rm } from "node:fs/promises";
import { createConnection, createServer, } from "node:net";
import { join, resolve } from "node:path";
import { HopperStartError } from "../domain/hopperErrors.js";
import { safeParseJson } from "../domain/safeJson.js";
/** Shared private parent of per-target lease sockets; it outlives individual sessions. */
export const HOPPER_TARGET_LEASE_DIRECTORY = join("/tmp", `rea-hopper-${process.getuid?.() ?? 0}`);
/** Keep two REA processes from opening duplicate Hopper documents for one target/profile. */
export const acquireHopperTargetLease = async (input) => {
    const directory = input.directory ?? HOPPER_TARGET_LEASE_DIRECTORY;
    await ensureLeaseDirectory(directory);
    // The canonical path only derives the lease key; it never authorizes access.
    // Common expected `realpath` failures include a missing target or path
    // component (ENOENT, ENOTDIR), an unreadable component (EACCES), or a
    // symlink loop (ELOOP). This catch also falls back for every other error,
    // which may hide a real filesystem problem. The lexical `resolve` fallback
    // still yields a deterministic key, but aliases may take separate leases
    // whenever `realpath` cannot resolve them.
    const targetPath = await realpath(input.targetPath).catch(() => resolve(input.targetPath));
    const key = createHash("sha256")
        .update(JSON.stringify({
        targetPath,
        targetKind: input.targetKind,
        loaderArgs: input.loaderArgs,
    }))
        .digest("hex")
        .slice(0, 32);
    const socketPath = join(directory, `${key}.sock`);
    const owner = { runId: input.runId, processId: process.pid };
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const server = createServer((socket) => sendOwner(socket, owner));
        const bound = await bind(server, socketPath);
        if (bound) {
            await chmod(socketPath, 0o600);
            let released = false;
            return {
                acquired: true,
                lease: {
                    release: async () => {
                        if (released)
                            return;
                        released = true;
                        await closeServer(server);
                        await rm(socketPath, { force: true });
                    },
                },
            };
        }
        const existingOwner = await readOwner(socketPath);
        if (existingOwner !== undefined)
            return { acquired: false, owner: existingOwner };
        await rm(socketPath, { force: true });
    }
    throw new HopperStartError({
        userMessage: "REA could not reserve this Hopper target. Close competing REA sessions and retry.",
    });
};
const ensureLeaseDirectory = async (directory) => {
    let directoryStat;
    try {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        directoryStat = await lstat(directory);
    }
    catch (cause) {
        throw new HopperStartError({
            cause,
            userMessage: "REA could not create or inspect its private Hopper lease directory.",
        });
    }
    if (directoryStat.isSymbolicLink() ||
        directoryStat.isDirectory() === false ||
        (process.getuid !== undefined && directoryStat.uid !== process.getuid()))
        throw new HopperStartError({
            userMessage: "REA's Hopper lease directory is not a private directory owned by this user.",
        });
    if ((directoryStat.mode & 0o077) !== 0)
        await chmod(directory, 0o700);
};
const bind = (server, socketPath) => new Promise((resolveBind, reject) => {
    const onError = (error) => {
        server.removeListener("listening", onListening);
        if (error.code === "EADDRINUSE")
            resolveBind(false);
        else
            reject(error);
    };
    const onListening = () => {
        server.removeListener("error", onError);
        resolveBind(true);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(socketPath);
});
const sendOwner = (socket, owner) => {
    socket.end(`${JSON.stringify(owner)}\n`);
};
const readOwner = (socketPath) => new Promise((resolveOwner) => {
    const socket = createConnection(socketPath);
    let response = "";
    const timer = setTimeout(() => {
        socket.destroy();
        resolveOwner(undefined);
    }, 250);
    const finish = (owner) => {
        clearTimeout(timer);
        socket.destroy();
        resolveOwner(owner);
    };
    socket.on("data", (chunk) => {
        response += chunk.toString("utf8");
        const newline = response.indexOf("\n");
        if (newline < 0)
            return;
        const parsed = safeParseJson(response.slice(0, newline));
        if (!parsed.ok) {
            finish(undefined);
            return;
        }
        const value = parsed.value;
        if (typeof value === "object" &&
            value !== null &&
            typeof Reflect.get(value, "runId") === "string" &&
            typeof Reflect.get(value, "processId") === "number")
            finish({
                runId: Reflect.get(value, "runId"),
                processId: Reflect.get(value, "processId"),
            });
        else
            finish(undefined);
    });
    socket.on("error", () => finish(undefined));
    socket.on("end", () => finish(undefined));
});
const closeServer = (server) => new Promise((resolveClose, reject) => {
    if (!server.listening) {
        resolveClose();
        return;
    }
    server.close((error) => (error ? reject(error) : resolveClose()));
});
