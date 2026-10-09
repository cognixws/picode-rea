import { readFile } from "node:fs/promises";
/** Safe diagnostics for a browser process that did not publish a CDP port. */
export class BrowserStartupError extends Error {
    _tag = "BrowserStartupError";
    failure;
    executable;
    elapsedMs;
    exitCode;
    signalCode;
    stderr;
    constructor(diagnostics, options) {
        super(browserStartupMessage(diagnostics.failure, diagnostics), options);
        this.failure = diagnostics.failure;
        this.executable = diagnostics.executable;
        this.elapsedMs = diagnostics.elapsedMs;
        this.exitCode = diagnostics.exitCode;
        this.signalCode = diagnostics.signalCode;
        this.stderr = diagnostics.stderr;
    }
}
/** Wait for Chrome's valid DevToolsActivePort or a terminal process outcome. */
export const waitForBrowserDevtoolsPort = async (options) => {
    const timeoutMs = options.timeoutMs ?? 15_000;
    const pollIntervalMs = options.pollIntervalMs ?? 25;
    const startedAt = performance.now();
    const terminal = childTermination(options, startedAt);
    const deadline = startedAt + timeoutMs;
    while (true) {
        const terminalState = currentTerminalState(options.child);
        if (terminalState !== null)
            throw startupError(options, startedAt, terminalState);
        const port = await readDevtoolsPort(options.activePortPath);
        if (port !== null)
            return port;
        const remainingMs = deadline - performance.now();
        if (remainingMs <= 0)
            throw startupError(options, startedAt, { failure: "timeout" });
        const outcome = await Promise.race([
            terminal,
            delay(Math.min(pollIntervalMs, remainingMs)).then(() => null),
        ]);
        if (outcome !== null)
            throw outcome;
    }
};
const childTermination = (options, startedAt) => new Promise((resolve) => {
    options.child.once("error", (cause) => {
        resolve(startupError(options, startedAt, {
            failure: "spawn-error",
            cause,
        }));
    });
    options.child.once("exit", () => {
        resolve(startupError(options, startedAt, options.child.signalCode === null
            ? { failure: "exited" }
            : { failure: "signalled" }));
    });
});
const currentTerminalState = (child) => {
    if (child.signalCode !== null)
        return { failure: "signalled" };
    if (child.exitCode !== null)
        return { failure: "exited" };
    return null;
};
const startupError = (options, startedAt, state) => new BrowserStartupError({
    failure: state.failure,
    executable: options.executable,
    elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
    exitCode: options.child.exitCode,
    signalCode: options.child.signalCode,
    stderr: options.stderr(),
}, state.failure === "spawn-error" ? { cause: state.cause } : undefined);
const readDevtoolsPort = async (path) => {
    try {
        const firstLine = (await readFile(path, "utf8")).trim().split("\n")[0];
        const port = Number(firstLine);
        return Number.isSafeInteger(port) && port > 0 && port <= 65_535
            ? port
            : null;
    }
    catch (cause) {
        // Missing or unreadable port files mean the port is unknown.
        void cause;
        return null;
    }
};
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const browserStartupMessage = (failure, diagnostics) => `Chrome CDP startup ${failure}; executable=${diagnostics.executable}; elapsed_ms=${String(diagnostics.elapsedMs)}; exit_code=${diagnostics.exitCode === null ? "null" : String(diagnostics.exitCode)}; signal=${diagnostics.signalCode ?? "null"}; stderr=${diagnostics.stderr.length === 0 ? "<empty>" : diagnostics.stderr}`;
