import { err } from "../domain/result.js";
/** Ping and validate the bridge after its socket is attached. */
export async function completeGhidraStartupHandshake(options) {
    const ping = await options.request("ping", {}, {
        signal: options.deadline.signal,
        timeoutMs: options.deadline.remainingMs(),
    });
    if (!ping.ok) {
        const failure = options.deadline.signal.aborted
            ? interruptionFailure(options)
            : ping.error;
        await options.cleanup();
        return err(failure);
    }
    const parsed = options.parseSessionInfo(ping.value);
    if (!parsed.ok || parsed.value.analysis_timed_out) {
        const failure = parsed.ok
            ? options.failure("analysis_timeout", "Ghidra auto-analysis reached its per-file deadline")
            : parsed.error;
        await options.cleanup();
        return err(failure);
    }
    return parsed;
}
const interruptionFailure = (options) => options.deadline.interruption === "cancelled"
    ? options.failure("cancelled", "Ghidra startup was cancelled")
    : options.failure("timeout", "Ghidra startup deadline elapsed", undefined, {
        timeoutMs: options.startupTimeoutMs,
    });
