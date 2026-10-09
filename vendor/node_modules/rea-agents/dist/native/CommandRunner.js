import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { realpath } from "node:fs/promises";
import { err, ok } from "../domain/result.js";
import { OwnedCommandFailure, runOwnedCommand, } from "../process/OwnedCommand.js";
/** Maximum wall-clock duration for one native command. */
export const NATIVE_COMMAND_TIMEOUT_MS = 60_000;
/** Retain complete command output up to a bounded aggregate size. */
export const NATIVE_COMMAND_OUTPUT_BUDGET_BYTES = 64 * 1024 * 1024;
/** Native command failure with retained partial output and cleanup status. */
export class NativeCommandFailure extends Error {
    tool;
    reason;
    exitCode;
    capture;
    cleanupFailure;
    cleanupResources;
    constructor(tool, reason, exitCode = null, options, capture = null, cleanupFailure = null, cleanupResources = []) {
        super(`Native command ${tool} failed: ${reason}`, options);
        this.tool = tool;
        this.reason = reason;
        this.exitCode = exitCode;
        this.capture = capture;
        this.cleanupFailure = cleanupFailure;
        this.cleanupResources = cleanupResources;
    }
}
/** Run allowlisted Xcode tools directly without a shell. */
export class XcrunCommandRunner {
    resolveTool;
    constructor(resolveTool = (tool, signal) => resolveXcrunTool(tool, signal)) {
        this.resolveTool = resolveTool;
    }
    run(tool, arguments_, options) {
        if (!ALLOWED_TOOLS.has(tool))
            return Promise.resolve(err(new NativeCommandFailure(tool, "unavailable")));
        return this.resolveTool(tool, options.signal).then(async (resolved) => {
            if (!resolved.ok)
                return resolved;
            const captured = await captureProcess(resolved.value.path, arguments_, tool, options);
            return captured.ok
                ? ok({
                    ...captured.value,
                    tool,
                    executable: resolved.value.path,
                    executableSha256: resolved.value.sha256,
                    toolVersion: null,
                    versionReason: "Tool exposes no uniform stable version flag; executable SHA-256 is a prelaunch file sample and does not prove atomic OS image binding.",
                    arguments: [...arguments_],
                })
                : captured;
        });
    }
}
const ALLOWED_TOOLS = new Set([
    "codesign",
    "dyld_info",
    "dwarfdump",
    "file",
    "lipo",
    "nm",
    "otool",
    "plutil",
    "strings",
    "swift-demangle",
    "vtool",
]);
/** Locate an Xcode tool through `xcrun --find` and sample its executable digest. */
export const resolveXcrunTool = async (tool, signal) => {
    const found = await captureProcess("/usr/bin/xcrun", ["--find", tool], "xcrun", signal === undefined ? {} : { signal });
    if (!found.ok) {
        return err(new NativeCommandFailure(tool, found.error.reason === "nonzero-exit" ||
            found.error.reason === "unavailable"
            ? "unavailable"
            : found.error.reason, found.error.exitCode, { cause: found.error }, found.error.capture, found.error.cleanupFailure, found.error.cleanupResources));
    }
    if (found.value.exitCode !== 0)
        return err(new NativeCommandFailure(tool, "unavailable", found.value.exitCode, undefined, failureCapture(found.value, false)));
    const candidate = found.value.stdout.trim();
    if (!candidate.startsWith("/"))
        return err(new NativeCommandFailure(tool, "unavailable", found.value.exitCode, undefined, failureCapture(found.value, false)));
    try {
        const path = await realpath(candidate);
        return ok({ path, sha256: await hashFile(path, signal) });
    }
    catch (cause) {
        const capture = failureCapture(found.value, false);
        if (signal?.aborted === true)
            return err(new NativeCommandFailure(tool, "cancelled", capture.exitCode, { cause }, capture));
        return err(new NativeCommandFailure(tool, "io", capture.exitCode, { cause }, capture));
    }
};
const failureCapture = (capture, truncated) => ({
    stdout: capture.stdout,
    stderr: capture.stderr,
    stdoutBytes: capture.stdoutBytes,
    stderrBytes: capture.stderrBytes,
    exitCode: capture.exitCode,
    signal: capture.signal,
    truncated,
});
const captureProcess = async (executable, arguments_, tool, options) => {
    const runId = `rea-native-command-${randomUUID()}`;
    try {
        const snapshot = await runOwnedCommand({
            command: executable,
            arguments: [...arguments_],
            runId,
            env: {
                PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
                LC_ALL: "C",
                LANG: "C",
            },
            hostEnvironment: {},
            ...(options.signal === undefined ? {} : { signal: options.signal }),
        }, {
            timeoutMs: NATIVE_COMMAND_TIMEOUT_MS,
            diagnosticBytes: NATIVE_COMMAND_OUTPUT_BUDGET_BYTES,
            acceptNonZeroExit: options.acceptNonZero === true,
        });
        return ok(processCaptureFromSnapshot(snapshot));
    }
    catch (cause) {
        if (cause instanceof OwnedCommandFailure) {
            const capture = cause.snapshot === null
                ? null
                : failureCapture(processCaptureFromSnapshot(cause.snapshot), cause.snapshot.diagnosticTruncated === true);
            return err(new NativeCommandFailure(tool, cause.reason === "process"
                ? processFailureReason(capture)
                : cause.reason, capture?.exitCode ?? null, { cause }, capture, cause.cleanupFailure, cause.resources));
        }
        return err(new NativeCommandFailure(tool, "io", null, { cause }));
    }
};
const processFailureReason = (capture) => capture !== null &&
    (capture.signal !== null ||
        (capture.exitCode !== null && capture.exitCode !== 0))
    ? "nonzero-exit"
    : "io";
const processCaptureFromSnapshot = (snapshot) => ({
    stdout: snapshot.stdout.text,
    stderr: snapshot.stderr.text,
    stdoutBytes: snapshot.stdout.bytes,
    stderrBytes: snapshot.stderr.bytes,
    exitCode: snapshot.exitCode ?? null,
    signal: snapshot.signal ?? null,
});
const hashFile = (path, signal) => new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path, signal === undefined ? undefined : { signal });
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolve(hash.digest("hex")));
});
