import { ProviderProcessSupervisor, spawnOwnedProviderProcess, } from "./ProviderProcess.js";
import { cleanupOwnedProcessGroup } from "./ProcessOwnership.js";
import { ProviderStartupDeadline, waitForAbortableDelay, } from "./ProviderDeadline.js";
/** A short-lived command failed its lifecycle or complete-output contract. */
export class OwnedCommandFailure extends Error {
    reason;
    snapshot;
    cleanupFailure;
    resources;
    constructor(reason, message, snapshot = null, cleanupFailure = null, options, resources = []) {
        super(message, options);
        this.reason = reason;
        this.snapshot = snapshot;
        this.cleanupFailure = cleanupFailure;
        this.resources = resources;
    }
}
/** Execute a single owned process with independent cleanup and bounded diagnostic retention. */
export const runOwnedCommand = async (spawn, limits, options = {}) => {
    const callerSignal = options.signal ?? spawn.signal;
    if (callerSignal?.aborted)
        throw new OwnedCommandFailure("cancelled", "Command cancelled before launch.");
    const deadline = new ProviderStartupDeadline(limits.timeoutMs, callerSignal);
    try {
        return await collectOwnedCommand(spawn, limits, options.launcher ?? spawnOwnedProviderProcess, deadline, callerSignal);
    }
    finally {
        deadline.dispose();
    }
};
const collectOwnedCommand = async (spawn, limits, launcher, deadline, callerSignal) => {
    const signal = deadline.signal;
    let launched;
    try {
        launched = await launcher({
            ...spawn,
            signal,
        });
    }
    catch (cause) {
        const interruption = deadline.interruption;
        if (interruption !== undefined)
            throw new OwnedCommandFailure(interruption, interruption === "cancelled"
                ? "Command cancelled during ownership preparation."
                : "Command deadline elapsed during ownership preparation.", null, null, { cause });
        throw cause;
    }
    let exceeded = false;
    let processFailure;
    const supervisor = new ProviderProcessSupervisor({
        ...launched,
        ownsProcessLifetime: true,
        cleanup: launched.cleanup ??
            (() => cleanupOwnedProcessGroup(launched.ownership)),
    }, {
        maxDiagnosticBytes: limits.diagnosticBytes,
        onDiagnostic: (event) => {
            if (event.type === "output" && event.truncated === true)
                exceeded = true;
            if (event.type === "error")
                processFailure = event.message;
        },
    });
    let failure;
    try {
        while (!(await supervisor.waitForOutputClose(10))) {
            const interruption = deadline.interruption;
            if (interruption !== undefined)
                throw new OwnedCommandFailure(interruption, interruption === "cancelled"
                    ? "Command cancelled."
                    : "Command deadline elapsed.");
            if (exceeded)
                throw new OwnedCommandFailure("output-limit", "Command diagnostic output exceeded its complete-output budget.");
            if (processFailure !== undefined)
                throw new OwnedCommandFailure("process", processFailure);
            await waitForAbortableDelay(25, signal);
        }
        const snapshot = supervisor.snapshot();
        const interruption = deadline.interruption;
        if (interruption !== undefined)
            throw new OwnedCommandFailure(interruption, interruption === "cancelled"
                ? "Command cancelled."
                : "Command deadline elapsed.", snapshot);
        if (exceeded)
            throw new OwnedCommandFailure("output-limit", "Command diagnostic output exceeded its complete-output budget.", snapshot);
        const acceptedNonzeroExit = limits.acceptNonZeroExit === true &&
            snapshot.exitCode !== null &&
            snapshot.exitCode !== undefined &&
            snapshot.exitCode !== 0 &&
            snapshot.signal === null;
        if (processFailure !== undefined ||
            ((snapshot.exitCode !== 0 || snapshot.signal !== null) &&
                !acceptedNonzeroExit))
            throw new OwnedCommandFailure("process", processFailure ??
                "Command failed; inspect its exit status and diagnostics.", snapshot);
    }
    catch (cause) {
        failure =
            cause instanceof OwnedCommandFailure
                ? cause
                : new OwnedCommandFailure("process", "Command collection failed.", null, null, { cause });
    }
    const stopped = await supervisor.stop();
    const snapshot = supervisor.snapshot();
    supervisor.dispose();
    if (stopped.status === "incomplete")
        throw new OwnedCommandFailure(failure?.reason ?? "process", failure?.message ?? "Command cleanup failed.", snapshot, stopped.reason, failure === undefined ? undefined : { cause: failure }, [
            spawn.runId,
            ...(spawn.cwd === undefined ? [] : [spawn.cwd]),
            `pid:${launched.ownership.leaderPid}`,
            `process-group:${launched.ownership.processGroupId}`,
        ]);
    if (failure !== undefined)
        throw new OwnedCommandFailure(failure.reason, failure.message, snapshot, failure.cleanupFailure, { cause: failure }, failure.resources);
    if (callerSignal?.aborted)
        throw new OwnedCommandFailure("cancelled", "Command cancelled.", snapshot);
    return snapshot;
};
