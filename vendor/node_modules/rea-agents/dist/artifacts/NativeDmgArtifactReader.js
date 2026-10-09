import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { parse } from "plist";
import { z } from "zod";
import { ArtifactReaderFailure, } from "./ArtifactReader.js";
import { DirectoryArtifactReader } from "./DirectoryArtifactReader.js";
import { execFileOutput } from "../process/ExecFileOutput.js";
const DETACH_TIMEOUT_MS = 120_000;
const attachOutputSchema = z.object({
    "system-entities": z.array(z.object({
        "dev-entry": z.string().startsWith("/dev/"),
        "mount-point": z.string().optional(),
    })),
});
const infoOutputSchema = z.object({
    images: z.array(z.object({
        "system-entities": z.array(z.object({ "dev-entry": z.string() })),
    })),
});
const systemHost = {
    async run(arguments_, signal, options) {
        try {
            const { stdout, stderr } = await execFileOutput("/usr/bin/hdiutil", [...arguments_], {
                ...(options === undefined ? {} : { timeout: options.timeoutMs }),
                ...(signal === undefined ? {} : { signal }),
            });
            return { stdout, stderr, exitCode: 0 };
        }
        catch (cause) {
            if (cause instanceof Error && cause.name === "AbortError")
                throw new ArtifactReaderFailure("cancelled", "DMG operation cancelled");
            const exitCode = processExitCode(cause);
            if (exitCode !== undefined)
                return {
                    stdout: processOutput(cause, "stdout"),
                    stderr: processOutput(cause, "stderr"),
                    exitCode,
                    cause,
                };
            throw new ArtifactReaderFailure(commandFailureReason(cause, arguments_[0]), `hdiutil ${arguments_[0] ?? "operation"} failed: ${describeCommandFailure(cause, arguments_)}`, { cause });
        }
    },
};
/** Read-only macOS DMG adapter that owns attachment and reverse-order detach. */
export class NativeDmgArtifactReader {
    path;
    host;
    format = "file";
    #provenance = [];
    #directory;
    #devices = [];
    #mountRoot;
    constructor(path, host) {
        this.path = path;
        this.host = host;
    }
    /** Verify and attach one image beneath an exclusively owned temporary root. */
    static async create(path, signal, host = systemHost) {
        if (process.platform !== "darwin" && host === systemHost)
            throw new ArtifactReaderFailure("unavailable", "Native DMG traversal is available only on macOS");
        const reader = new NativeDmgArtifactReader(path, host);
        await reader.attach(signal);
        return reader;
    }
    async *entries(signal) {
        if (this.#directory === undefined)
            throw new ArtifactReaderFailure("unavailable", "DMG is not attached");
        const prefix = basename(this.path);
        for await (const entry of this.#directory.entries(signal))
            yield { ...entry, path: `${prefix}/${entry.path}` };
    }
    open(entry, signal) {
        if (this.#directory === undefined)
            return Promise.reject(new ArtifactReaderFailure("unavailable", "DMG is not attached"));
        return this.#directory.open(entry, signal);
    }
    provenance() {
        return structuredClone(this.#provenance);
    }
    async close() {
        let detachFailure;
        const remainingDevices = [];
        for (const device of [...this.#devices].reverse()) {
            try {
                await runChecked(this.host, ["detach", device], undefined, {
                    timeoutMs: DETACH_TIMEOUT_MS,
                });
                this.#provenance.push(command(["detach", device], ["mount"]));
            }
            catch (cause) {
                // Detaching a synthesized APFS container also ejects the image that
                // backs it, so a later whole disk of the same image may already be
                // gone. Only a device that is still attached is a cleanup failure.
                if (await this.#isAttached(device)) {
                    remainingDevices.push(device);
                    detachFailure ??= cause;
                }
            }
        }
        this.#devices = remainingDevices.reverse();
        if (this.#devices.length === 0 && this.#mountRoot !== undefined)
            await rm(this.#mountRoot, { recursive: true, force: true }).then(() => {
                this.#mountRoot = undefined;
                this.#directory = undefined;
            }, (cause) => {
                detachFailure ??= cause;
            });
        if (detachFailure !== undefined)
            throw new ArtifactReaderFailure("unavailable", `DMG detach or mount-root cleanup failed for ${JSON.stringify(this.path)}: ${failureMessage(detachFailure)}`, { cause: detachFailure });
    }
    /**
     * Report whether hdiutil still lists a device; unknown state counts as
     * attached. Like detach, this cleanup query runs after the inventory
     * snapshot has captured provenance, so it is not recorded there.
     */
    async #isAttached(device) {
        try {
            const info = await runChecked(this.host, ["info", "-plist"], undefined, {
                timeoutMs: DETACH_TIMEOUT_MS,
            });
            const parsed = infoOutputSchema.parse(parse(info.stdout));
            return parsed.images.some((image) => image["system-entities"].some((entity) => entity["dev-entry"] === device));
        }
        catch {
            return true;
        }
    }
    async attach(signal) {
        await runChecked(this.host, ["verify", this.path], signal);
        this.#provenance.push(command(["verify", this.path], ["read"]));
        this.#mountRoot = await realpath(await mkdtemp(join(tmpdir(), "rea-dmg-")));
        try {
            const attached = await runChecked(this.host, [
                "attach",
                "-readonly",
                "-nobrowse",
                "-plist",
                "-mountroot",
                this.#mountRoot,
                this.path,
            ], signal);
            const parsed = attachOutputSchema.parse(parse(attached.stdout));
            const devices = [
                ...new Set(parsed["system-entities"].map((entity) => entity["dev-entry"])),
            ];
            // Detaching an observed whole disk also detaches its partitions. Do not
            // subsequently detach the now-unavailable child devices.
            this.#devices = devices.filter((device) => !devices.some((parent) => /^\/dev\/disk\d+$/u.test(parent) &&
                device.startsWith(`${parent}s`) &&
                /^\d+$/u.test(device.slice(parent.length + 1))));
            if (this.#devices.length === 0)
                throw new ArtifactReaderFailure("format", "hdiutil returned no attached devices");
            for (const entity of parsed["system-entities"])
                if (entity["mount-point"] !== undefined &&
                    !entity["mount-point"].startsWith(`${this.#mountRoot}/`))
                    throw new ArtifactReaderFailure("path", "hdiutil mounted outside the owned root");
            this.#provenance.push(command([
                "attach",
                "-readonly",
                "-nobrowse",
                "-plist",
                "-mountroot",
                this.#mountRoot,
                this.path,
            ], ["read", "mount"]));
            this.#directory = new DirectoryArtifactReader(this.#mountRoot);
        }
        catch (cause) {
            let cleanupFailure;
            try {
                await this.close();
            }
            catch (cleanupCause) {
                cleanupFailure = cleanupCause;
            }
            if (cleanupFailure !== undefined)
                throw new ArtifactReaderFailure("unavailable", `DMG attach failed and cleanup could not detach every device: ${failureMessage(cause)}; cleanup: ${failureMessage(cleanupFailure)}`, { cause: new AggregateError([cause, cleanupFailure]) });
            throw cause;
        }
    }
}
const failureMessage = (cause) => cause instanceof Error ? cause.message : String(cause);
const runChecked = async (host, arguments_, signal, options) => {
    let result;
    try {
        result = await host.run(arguments_, signal, options);
    }
    catch (cause) {
        if (cause instanceof ArtifactReaderFailure)
            throw cause;
        if (cause instanceof Error && cause.name === "AbortError")
            throw new ArtifactReaderFailure("cancelled", "DMG operation cancelled", {
                cause,
            });
        throw new ArtifactReaderFailure(commandFailureReason(cause, arguments_[0]), `hdiutil ${arguments_[0] ?? "operation"} failed: ${describeCommandFailure(cause, arguments_)}`, { cause });
    }
    if (result.exitCode !== 0) {
        const failure = {
            command: "/usr/bin/hdiutil",
            exitCode: result.exitCode,
            ...(result.cause === undefined
                ? {}
                : { code: processExitCode(result.cause) }),
            stdout: result.stdout,
            ...(result.stderr === undefined ? {} : { stderr: result.stderr }),
        };
        const reason = commandFailureReason(failure, arguments_[0]);
        const details = describeCommandFailure(failure, arguments_);
        const unknownVerifyFailure = arguments_[0] === "verify" && reason === "unavailable";
        throw new ArtifactReaderFailure(reason, unknownVerifyFailure
            ? `hdiutil verify failed; captured diagnostics do not establish the failure cause: ${details}`
            : `hdiutil ${arguments_[0] ?? "operation"} failed: ${details}`, result.cause === undefined ? undefined : { cause: result.cause });
    }
    return { stdout: result.stdout, exitCode: 0 };
};
const describeCommandFailure = (cause, arguments_) => {
    const fields = {
        command: "/usr/bin/hdiutil",
        arguments: [...arguments_],
    };
    if (typeof cause === "object" && cause !== null) {
        for (const key of [
            "code",
            "exitCode",
            "errno",
            "syscall",
            "signal",
            "stdout",
            "stderr",
        ]) {
            const value = Reflect.get(cause, key);
            if (typeof value === "string" || typeof value === "number")
                fields[key] = value;
        }
        const code = Reflect.get(cause, "code");
        if (typeof code === "number")
            fields.exitCode = code;
    }
    if (cause instanceof ArtifactReaderFailure)
        fields.message = cause.message;
    else if (cause instanceof Error)
        fields.message = cause.message;
    return JSON.stringify(fields);
};
const processExitCode = (cause) => {
    if (typeof cause !== "object" || cause === null)
        return undefined;
    const exitCode = Reflect.get(cause, "exitCode");
    if (typeof exitCode === "number")
        return exitCode;
    const code = Reflect.get(cause, "code");
    return typeof code === "number" ? code : undefined;
};
const processOutput = (cause, field) => {
    if (typeof cause !== "object" || cause === null)
        return "";
    const value = Reflect.get(cause, field);
    return typeof value === "string" ? value : "";
};
const commandFailureReason = (cause, operation) => {
    if (typeof cause !== "object" || cause === null)
        return "unavailable";
    const code = Reflect.get(cause, "code");
    const exitCode = Reflect.get(cause, "exitCode");
    if (typeof code === "number" || typeof exitCode === "number")
        return operation === "verify" ? verifyFailureReason(cause) : "unavailable";
    if (code === "ENOENT") {
        const syscall = Reflect.get(cause, "syscall");
        return typeof syscall === "string" && syscall.startsWith("spawn")
            ? "unavailable"
            : "io";
    }
    if (code === "EACCES" ||
        code === "EPERM" ||
        code === "EIO" ||
        code === "ENOTDIR" ||
        code === "EISDIR" ||
        code === "ENODEV" ||
        code === "EROFS" ||
        code === "EMFILE" ||
        code === "ENFILE")
        return "io";
    return "unavailable";
};
const verifyFailureReason = (cause) => {
    const diagnostic = verifyFailureDiagnostic(processOutput(cause, "stdout"), processOutput(cause, "stderr"));
    switch (diagnostic) {
        case "image not recognized":
            return "format";
        case "invalid checksum":
        case "image data corrupted":
            return "integrity";
        case "No such file or directory":
        case "Permission denied":
        case "Input/output error":
            return "io";
        default:
            return "unavailable";
    }
};
const verifyFailureDiagnostic = (stdout, stderr) => {
    const prefix = "hdiutil: verify failed - ";
    return `${stdout}\n${stderr}`
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .find((line) => line.startsWith(prefix))
        ?.slice(prefix.length);
};
const command = (arguments_, effects) => ({
    tool: "/usr/bin/hdiutil",
    arguments: [...arguments_],
    tool_version: null,
    executable_sha256: null,
    exit_code: 0,
    effects,
});
