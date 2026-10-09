import { spawn } from "node:child_process";
import { WindowsOwnedProcess } from "../windows/WindowsOwnedProcess.js";
import { prepareProcessOwnershipInspection } from "./ProcessOwnershipObservation.js";
const DEFAULT_TERMINATION_GRACE_MS = 250;
const DEFAULT_KILL_GRACE_MS = 1_000;
/**
 * Spawn a provider in an owned Windows job or dedicated POSIX process group.
 *
 * The caller remains responsible for persisting any ownership manifest and for
 * selecting provider-specific command arguments or environment values.
 */
export const spawnOwnedProviderProcess = async (options) => {
    options.signal?.throwIfAborted();
    await prepareProcessOwnershipInspection(options.signal);
    options.signal?.throwIfAborted();
    const platform = options.platform ?? process.platform;
    const hostEnvironment = options.hostEnvironment ?? process.env;
    const environment = {
        ...hostEnvironment,
        ...options.env,
        REA_PROCESS_RUN_ID: options.runId,
    };
    if (platform === "win32" && process.platform === "win32") {
        if (options.stdin === "pipe")
            throw new Error("Owned Windows provider processes do not support protocol stdin");
        const child = new WindowsOwnedProcess(options.command, options.arguments, options.cwd, environment, options.windowsVerbatimArguments ?? false);
        return {
            process: child,
            ownership: {
                runId: options.runId,
                leaderPid: child.pid,
                processGroupId: child.pid,
                expectedParentPid: process.pid,
            },
            cleanup: () => child.cleanup(),
        };
    }
    const child = spawn(options.command, [...options.arguments], {
        shell: false,
        windowsHide: true,
        stdio: [options.stdin ?? "ignore", "pipe", "pipe"],
        detached: platform !== "win32",
        windowsVerbatimArguments: options.windowsVerbatimArguments ?? false,
        env: environment,
        ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    });
    await waitForSpawn(child);
    const pid = child.pid;
    if (pid === undefined)
        throw new Error("Provider launcher has no process ID");
    const ownership = {
        runId: options.runId,
        leaderPid: pid,
        processGroupId: pid,
        expectedParentPid: process.pid,
        ...(options.expectedCommand === null
            ? {}
            : { expectedCommand: options.expectedCommand ?? options.command }),
    };
    return { process: child, ownership };
};
/**
 * Supervises only generic process resources; wire protocol remains adapter-owned.
 *
 * Output retention is complete per stream; adapters own resource budgets. Stop
 * first honors token-verified group cleanup when supplied, otherwise it uses a
 * bounded TERM-to-KILL escalation for a directly owned child.
 */
export class ProviderProcessSupervisor {
    launch;
    #options;
    #stdout = new ProcessOutputCapture();
    #stderr = new ProcessOutputCapture();
    #exit = deferred();
    #outputClose = deferred();
    #outputClosed = false;
    #stdoutObservedBytes = 0;
    #stderrObservedBytes = 0;
    #diagnosticTruncated = false;
    #onStdout = (chunk) => {
        this.#capture("stdout", this.#stdout, chunk);
    };
    #onStderr = (chunk) => {
        this.#capture("stderr", this.#stderr, chunk);
    };
    #onStdoutError = (cause) => {
        this.#recordStreamError("stdout", cause);
    };
    #onStderrError = (cause) => {
        this.#recordStreamError("stderr", cause);
    };
    #onExit = (code, signal) => {
        this.#recordExit(code, signal);
    };
    #onClose = (code, signal) => {
        this.#recordExit(code, signal);
        this.#outputClosed = true;
        this.#outputClose.resolve(undefined);
    };
    #onError = (cause) => {
        this.#options.onDiagnostic?.({ type: "error", message: cause.message });
    };
    #exitObservation;
    #stopPromise;
    #disposed = false;
    constructor(launch, options = {}) {
        this.launch = launch;
        this.#options = options;
        if (options.captureStdout !== false)
            this.#attach(launch.process.stdout, "stdout");
        this.#attach(launch.process.stderr, "stderr");
        launch.process.once("exit", this.#onExit);
        launch.process.once("close", this.#onClose);
        launch.process.on("error", this.#onError);
        if (launch.process.exitCode !== null || launch.process.signalCode !== null)
            this.#recordExit(launch.process.exitCode, launch.process.signalCode);
    }
    /** Latest retained output and exit observation, with explicit configured truncation. */
    snapshot() {
        return {
            ...(this.#diagnosticTruncated ? { diagnosticTruncated: true } : {}),
            stdout: this.#stdout.snapshot(),
            stderr: this.#stderr.snapshot(),
            exitCode: this.#exitObservation?.code,
            signal: this.#exitObservation?.signal,
        };
    }
    /** Begin a new observation on a retained process without retaining earlier output. */
    resetOutput() {
        this.#stdout.reset();
        this.#stderr.reset();
        this.#stdoutObservedBytes = 0;
        this.#stderrObservedBytes = 0;
        this.#diagnosticTruncated = false;
    }
    /** Wait for process exit up to a caller-owned bounded interval. */
    async waitForExit(timeoutMs) {
        return waitForProcessEvent(this.#exitObservation !== undefined, this.#exit.promise, timeoutMs);
    }
    /** Wait until the producer has closed its output streams; exit alone does not prove complete output. */
    async waitForOutputClose(timeoutMs) {
        return waitForProcessEvent(this.#outputClosed, this.#outputClose.promise, timeoutMs);
    }
    /** Share each stop attempt; incomplete cleanup retains ownership and permits retry. */
    stop(options = {}) {
        this.#stopPromise ??= this.#stop(options).then((result) => {
            if (result.status === "incomplete")
                this.#stopPromise = undefined;
            return result;
        });
        return this.#stopPromise;
    }
    /** Detach capture and process listeners after an adapter releases ownership. */
    dispose() {
        if (this.#disposed)
            return;
        this.#disposed = true;
        this.launch.process.stdout?.off("data", this.#onStdout);
        this.launch.process.stdout?.off("error", this.#onStdoutError);
        this.launch.process.stderr?.off("data", this.#onStderr);
        this.launch.process.stderr?.off("error", this.#onStderrError);
        this.launch.process.off("exit", this.#onExit);
        this.launch.process.off("close", this.#onClose);
        this.launch.process.off("error", this.#onError);
    }
    async #stop(options) {
        let completed = false;
        try {
            const result = await this.#stopWithin(options);
            completed = result.status !== "incomplete";
            return result;
        }
        finally {
            if (completed)
                this.dispose();
        }
    }
    async #stopWithin(options) {
        try {
            if (!this.launch.ownsProcessLifetime)
                return { status: "not-owned" };
            if (this.launch.cleanup !== undefined) {
                const cleanup = await this.#ownedCleanup(options.cleanupResult);
                if (!cleanup.cleaned)
                    return { status: "incomplete", reason: cleanup.reason };
                const graceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
                if (await this.waitForExit(graceMs))
                    return { status: "verified-cleanup" };
                const retried = await this.launch.cleanup();
                if (!retried.cleaned)
                    return { status: "incomplete", reason: retried.reason };
                if (await this.waitForExit(graceMs))
                    return { status: "verified-cleanup" };
                return {
                    status: "incomplete",
                    reason: "verified process-group cleanup did not stop the launcher",
                };
            }
            if (this.#exitObservation !== undefined)
                return { status: "already-exited" };
            this.#signal("SIGTERM");
            if (await this.waitForExit(options.terminationGraceMs ?? DEFAULT_TERMINATION_GRACE_MS))
                return { status: "terminated" };
            this.#signal("SIGKILL");
            if (await this.waitForExit(options.killGraceMs ?? DEFAULT_KILL_GRACE_MS))
                return { status: "killed" };
            return {
                status: "incomplete",
                reason: "owned provider process did not exit after SIGKILL",
            };
        }
        catch (cause) {
            return {
                status: "incomplete",
                reason: cause instanceof Error
                    ? cause.message
                    : "owned provider process cleanup failed",
            };
        }
    }
    #ownedCleanup(supplied) {
        if (supplied !== undefined)
            return Promise.resolve(supplied);
        const cleanup = this.launch.cleanup;
        return cleanup === undefined
            ? Promise.resolve({
                cleaned: false,
                reason: "owned provider process has no cleanup capability",
            })
            : cleanup();
    }
    #signal(signal) {
        if (this.#exitObservation !== undefined)
            return;
        this.launch.process.kill(signal);
    }
    #attach(stream, name) {
        if (name === "stdout") {
            stream?.on("data", this.#onStdout);
            stream?.on("error", this.#onStdoutError);
        }
        else {
            stream?.on("data", this.#onStderr);
            stream?.on("error", this.#onStderrError);
        }
    }
    #recordStreamError(stream, cause) {
        this.#options.onDiagnostic?.({
            type: "error",
            message: `${stream} stream failed: ${cause.message}`,
        });
    }
    #capture(stream, capture, chunk) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        if (stream === "stdout")
            this.#stdoutObservedBytes += bytes.byteLength;
        else
            this.#stderrObservedBytes += bytes.byteLength;
        const remaining = this.#options.maxDiagnosticBytes === undefined
            ? bytes.byteLength
            : Math.max(0, this.#options.maxDiagnosticBytes -
                this.#stdout.bytes -
                this.#stderr.bytes);
        const retained = Math.min(bytes.byteLength, remaining);
        if (retained < bytes.byteLength)
            this.#diagnosticTruncated = true;
        if (retained > 0)
            capture.append(bytes.subarray(0, retained));
        this.#options.onDiagnostic?.({
            type: "output",
            stream,
            bytes: bytes.byteLength,
            totalBytes: stream === "stdout"
                ? this.#stdoutObservedBytes
                : this.#stderrObservedBytes,
            ...(retained < bytes.byteLength ? { truncated: true } : {}),
        });
    }
    #recordExit(code, signal) {
        if (this.#exitObservation !== undefined)
            return;
        this.#exitObservation = { code, signal };
        this.#exit.resolve(this.#exitObservation);
        this.#options.onDiagnostic?.({
            type: "exit",
            code,
            signal,
            snapshot: this.snapshot(),
        });
    }
}
class ProcessOutputCapture {
    #chunks = [];
    #bytes = 0;
    get bytes() {
        return this.#bytes;
    }
    reset() {
        this.#chunks.length = 0;
        this.#bytes = 0;
    }
    append(chunk) {
        this.#bytes += chunk.byteLength;
        this.#chunks.push(Buffer.from(chunk));
    }
    snapshot() {
        const text = Buffer.concat(this.#chunks, this.#bytes).toString("utf8");
        return {
            text,
            bytes: this.#bytes,
        };
    }
}
const deferred = () => {
    let resolver;
    const promise = new Promise((resolve) => {
        resolver = resolve;
    });
    return {
        promise,
        resolve: (value) => {
            resolver?.(value);
        },
    };
};
const waitForSpawn = (child) => new Promise((resolve, reject) => {
    const onSpawn = () => {
        child.off("error", onError);
        resolve();
    };
    const onError = (cause) => {
        child.off("spawn", onSpawn);
        reject(cause);
    };
    child.once("spawn", onSpawn);
    child.once("error", onError);
});
const waitForProcessEvent = async (observed, event, timeoutMs) => {
    if (observed)
        return true;
    let timer;
    try {
        return await Promise.race([
            event.then(() => true),
            new Promise((resolve) => {
                timer = setTimeout(() => resolve(false), Math.max(0, timeoutMs));
            }),
        ]);
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
    }
};
