import { parseProcessCapture } from "../../domain/process/processCapture.js";
import { err, ok } from "../../domain/result.js";
import { AnalysisCapabilityUnavailableError } from "../../domain/analysisErrorCore.js";
import {} from "../../domain/analysisErrorBase.js";
import { describeProcessCaptureExecutionFailure, ProcessCaptureError, processCaptureCancelled, } from "./ProcessCaptureError.js";
export { ProcessCaptureError } from "./ProcessCaptureError.js";
import { startProcessSampler } from "./ProcessSampling.js";
import { snapshotRoots } from "./FilesystemSnapshot.js";
import { TerminalRenderer } from "./TerminalRenderer.js";
import { normalizeProcessText } from "./ProcessNormalization.js";
import { selectCapturedProcessGroupIds } from "../ProcessOwnershipProcessTree.js";
import { awaitTerminalExit, buildCaptureResult, cleanupReportFailure, captureTerminalFrames, createProcessCaptureObservationBuffer, createRunManifest, observeLaunchedExecutable, observeSelectedExecutable, observeSettlement, prepareProcessCapture, releaseProcessResources, resolveProcessResult, settleProcessCaptureJournal, } from "./ProcessCaptureLifecycle.js";
import { assertNotCancelled, resolveProcessScenarioRuntimePaths, } from "./ProcessScenarioRuntimeValidation.js";
import { createProcessCaptureJournal, scheduleScenarioInteractions, } from "./ProcessCaptureJournal.js";
import { makeProcessCaptureEnvironment } from "./ProcessCaptureEnvironment.js";
import { classifyFilesystemEffects } from "./ProcessFilesystemEffects.js";
import { processCaptureOwnershipUnavailableReason } from "./ProcessCaptureCapability.js";
import { DarwinProcessOwnershipInspectionError } from "../DarwinProcessRunTokenReader.js";
export { probeProcessCaptureCapability } from "./ProcessCaptureCapability.js";
const cleanupFailedStartup = async (options) => {
    const sampledProcessGroupIds = options.terminal !== undefined &&
        options.observations?.process_samples.state === "available"
        ? selectCapturedProcessGroupIds(options.terminal.pid, options.observations.process_samples.value).filter((groupId) => groupId !== options.terminal?.pid)
        : undefined;
    options.terminal?.kill("SIGKILL");
    if (options.observations !== undefined && options.renderer !== undefined) {
        try {
            options.observations.rendered_frames = {
                state: "available",
                value: await options.renderer.frames(),
            };
        }
        catch (cause) {
            options.observations.rendered_frames = {
                state: "unavailable",
                reason: `Rendered terminal frame collection failed: ${cause instanceof Error ? cause.message : "unknown failure"}`,
            };
        }
    }
    const cleanupFailure = await releaseProcessResources({
        timers: options.timers,
        terminal: options.terminal,
        renderer: options.renderer,
        runId: options.runId,
        captureBaseline: options.captureBaseline,
        ...(sampledProcessGroupIds === undefined ? {} : { sampledProcessGroupIds }),
        temporaryRoot: options.temporaryRoot,
        ...(options.cleanupHost === undefined ? {} : { host: options.cleanupHost }),
    });
    if (cleanupReportFailure(cleanupFailure) !== undefined) {
        resolveProcessResult(undefined, options.cause, cleanupFailure, options.observations, {
            scenario: options.scenario,
            ...(options.terminal === undefined
                ? {}
                : { rootPid: options.terminal.pid }),
        });
    }
    throw options.cause;
};
const createTerminalRenderer = (scenario, temporaryRoot, terminalPid, recordEvent) => new TerminalRenderer({
    columns: scenario.terminal.columns,
    rows: scenario.terminal.rows,
    scrollback: scenario.terminal.scrollback,
    maxBytes: scenario.limits.output_bytes,
    normalize: (value) => normalizeProcessText(value, scenario, temporaryRoot, terminalPid()),
    recordEvent,
});
const startCaptureRuntime = async (options) => {
    const { scenario } = options;
    let renderer;
    let terminal;
    try {
        const { spawn } = await import("@lydell/node-pty");
        const selectedExecutable = await observeSelectedExecutable(scenario.executable, options.signal);
        const startedAt = new Date();
        const started = Date.now();
        let lastOutput = started;
        renderer = createTerminalRenderer(scenario, options.temporaryRoot, () => terminal?.pid ?? -1, options.recordEvent);
        terminal = spawn(scenario.executable, [...scenario.arguments], {
            cwd: scenario.working_directory,
            env: makeProcessCaptureEnvironment(options),
            cols: scenario.terminal.columns,
            rows: scenario.terminal.rows,
            name: "xterm-256color",
        });
        options.onSpawn(terminal.pid);
        options.observationBuffer.target_pid = {
            state: "available",
            value: scenario.normalization.pids ? 1 : terminal.pid,
        };
        const executableIdentity = observeLaunchedExecutable(scenario.executable, selectedExecutable);
        const framesTruncated = captureTerminalFrames({
            ...options,
            terminal,
            started,
            onOutput: () => (lastOutput = Date.now()),
            renderer,
        });
        scheduleScenarioInteractions({
            ...options,
            getTerminal: () => terminal,
            renderer,
            started,
        });
        const stopSampler = startProcessSampler({
            rootPid: terminal.pid,
            runId: options.runId,
            started,
            limit: scenario.limits.processes,
            samples: options.samples,
            recordEvent: options.recordEvent,
        });
        return {
            renderer,
            terminal,
            started,
            startedAt,
            executableIdentity,
            lastOutput: () => lastOutput,
            framesTruncated,
            stopSampler,
        };
    }
    catch (cause) {
        return cleanupFailedStartup({
            cause,
            timers: options.timers,
            terminal,
            renderer,
            runId: options.runId,
            captureBaseline: options.ownershipBaseline,
            scenario,
            ...(options.cleanupHost === undefined
                ? {}
                : { cleanupHost: options.cleanupHost }),
            observations: options.observationBuffer,
            temporaryRoot: options.temporaryRoot,
        });
    }
};
const finishProcessRun = async (options) => {
    await options.stopSampler();
    const sampledProcessGroupIds = options.runtime === undefined
        ? undefined
        : selectCapturedProcessGroupIds(options.runtime.terminal.pid, options.samples).filter((groupId) => groupId !== options.runtime?.terminal.pid);
    const cleanup = await releaseProcessResources({
        timers: options.timers,
        terminal: options.runtime?.terminal,
        renderer: options.runtime?.renderer,
        runId: options.runId,
        captureBaseline: options.captureBaseline,
        ...(sampledProcessGroupIds === undefined ? {} : { sampledProcessGroupIds }),
        temporaryRoot: options.temporaryRoot,
        ...(options.cleanupHost === undefined ? {} : { host: options.cleanupHost }),
    });
    const cleanupFailure = cleanupReportFailure(cleanup);
    let { capture, executionFailure } = options;
    let verifiedCapture;
    if (capture !== undefined && cleanupFailure === undefined) {
        const settlement = capture.settlement.state === "quiesced"
            ? { ...capture.settlement, cleanup_outcome: "not_required" }
            : { ...capture.settlement, cleanup_outcome: "cleaned" };
        const completedCapture = {
            ...capture,
            settlement,
            cleanup: {
                owned_process_group: "verified",
                temporary_root: "removed",
            },
        };
        try {
            verifiedCapture = parseProcessCapture(completedCapture);
        }
        catch (cause) {
            executionFailure = new ProcessCaptureError(`process capture validation failed${cause instanceof Error ? `: ${cause.message}` : ""}`, { cause });
        }
    }
    const rootPid = options.runtime?.terminal.pid ?? options.rootPid;
    const partialContext = rootPid === undefined
        ? { scenario: options.scenario }
        : { scenario: options.scenario, rootPid };
    return resolveProcessResult(cleanupFailure === undefined ? verifiedCapture : capture, executionFailure, cleanup, options.observations, partialContext);
};
/** Preserve typed process-inspection preflight failures at the capture boundary. */
export const normalizeCaptureFailure = (cause, signal) => {
    if (cause instanceof ProcessCaptureError)
        return cause;
    if (cause instanceof DarwinProcessOwnershipInspectionError)
        return new ProcessCaptureError(cause.message, { cause });
    if (signal?.aborted === true &&
        (cause === signal.reason ||
            (cause instanceof Error && cause.name === "AbortError")))
        return processCaptureCancelled();
    return cause;
};
const completeCapture = async (options) => {
    const unavailableReason = (stage, cause) => `${stage} failed: ${cause instanceof Error ? cause.message : "unknown failure"}`;
    const { runtime, scenario } = options;
    const { reason } = options.exit;
    if (reason === "cancelled")
        throw processCaptureCancelled();
    let settlement;
    try {
        settlement = await observeSettlement(options.runId, selectCapturedProcessGroupIds(runtime.terminal.pid, options.samples), scenario.settle_ms, options.recordEvent, options.hostPlatform);
    }
    catch (cause) {
        options.observationBuffer.settlement = {
            state: "unavailable",
            reason: unavailableReason("Process settlement observation", cause),
        };
        throw cause;
    }
    options.observationBuffer.settlement = {
        state: "available",
        value: settlement,
    };
    const samplingPartial = (await runtime.stopSampler()).partial;
    await settleProcessCaptureJournal(options.eventJournal);
    assertNotCancelled(options.signal);
    let after;
    try {
        after = await options.captureSnapshot(scenario, options.signal);
    }
    catch (cause) {
        options.observationBuffer.filesystem_snapshots = {
            ...options.observationBuffer.filesystem_snapshots,
            after: {
                state: "unavailable",
                reason: unavailableReason("Final filesystem snapshot", cause),
            },
        };
        throw cause;
    }
    options.observationBuffer.filesystem_snapshots = {
        ...options.observationBuffer.filesystem_snapshots,
        after: {
            state: "available",
            value: { files: after.files, truncated: after.truncated },
        },
    };
    options.recordEvent("filesystem_checkpoints", 1);
    let renderedFrames;
    try {
        renderedFrames = await runtime.renderer.frames();
    }
    catch (cause) {
        options.observationBuffer.rendered_frames = {
            state: "unavailable",
            reason: unavailableReason("Rendered terminal frame collection", cause),
        };
        throw cause;
    }
    options.observationBuffer.rendered_frames = {
        state: "available",
        value: renderedFrames,
    };
    const checkpoints = [
        {
            name: "before",
            at_ms: 0,
            files: options.before.files,
            effects: [],
            truncated: options.before.truncated,
        },
        {
            name: "after_settlement",
            at_ms: Math.max(0, Date.now() - runtime.started),
            files: after.files,
            effects: classifyFilesystemEffects(options.before.files, after.files),
            truncated: after.truncated,
        },
    ];
    let manifest;
    try {
        manifest = await createRunManifest(scenario, runtime.startedAt, new Date(), runtime.executableIdentity, { platform: options.hostPlatform, architecture: process.arch });
    }
    catch (cause) {
        options.observationBuffer.manifest = {
            state: "unavailable",
            reason: unavailableReason("Capture manifest creation", cause),
        };
        throw cause;
    }
    options.observationBuffer.manifest = { state: "available", value: manifest };
    const truncated = options.initiallyTruncated ||
        after.truncated ||
        runtime.framesTruncated() ||
        checkpoints.some(({ truncated: partial }) => partial) ||
        samplingPartial ||
        runtime.renderer.truncated();
    return buildCaptureResult({
        frames: options.frames,
        exit: { ...options.exit, reason },
        samples: options.samples,
        before: options.before,
        after,
        truncated,
        scenario,
        rootPid: runtime.terminal.pid,
        samplingPartial,
        renderedFrames,
        interactions: options.interactions,
        checkpoints,
        settlement,
        manifest,
        eventJournal: options.eventJournal,
    });
};
/** Execute one caller-selected scenario and return bounded observations. */
const runProcessScenario = async (scenario, signal, hostEnvironment = process.env, hostPlatform = process.platform, captureSnapshot = snapshotRoots, cleanupHost) => {
    const { temporaryRoot, runId, ownershipBaseline, before } = await prepareProcessCapture(scenario, signal, captureSnapshot);
    const frames = [];
    const samples = [];
    const interactions = [];
    const journal = createProcessCaptureJournal();
    const { entries: eventJournal, recordEvent } = journal;
    recordEvent("filesystem_checkpoints", 0);
    const observations = createProcessCaptureObservationBuffer({
        frames,
        interactions,
        samples,
        eventJournal,
        before,
    });
    let runtime;
    let actualRootPid;
    const timers = new Set();
    let capture;
    let executionFailure;
    let stopSampler = async () => ({ partial: false });
    const dispatchedEventIndexes = new Set();
    try {
        runtime = await startCaptureRuntime({
            scenario,
            hostEnvironment,
            temporaryRoot,
            runId,
            ownershipBaseline,
            ...(cleanupHost === undefined ? {} : { cleanupHost }),
            observationBuffer: observations,
            onSpawn: (pid) => {
                actualRootPid = pid;
            },
            frames,
            samples,
            interactions,
            timers,
            dispatchedEventIndexes,
            recordEvent,
            ...(signal === undefined ? {} : { signal }),
        });
        stopSampler = runtime.stopSampler;
        const exit = await awaitTerminalExit({
            terminal: runtime.terminal,
            scenario,
            started: runtime.started,
            lastOutput: runtime.lastOutput,
            signal,
            timers,
            interactions,
            dispatchedEventIndexes,
            recordEvent,
        });
        observations.exit = {
            state: "available",
            value: {
                code: exit.reason === "exited" && exit.exitCode >= 0 ? exit.exitCode : null,
                signal: exit.signal ?? null,
                reason: exit.reason,
            },
        };
        capture = await completeCapture({
            scenario,
            hostPlatform,
            runtime,
            runId,
            temporaryRoot,
            before,
            frames,
            samples,
            interactions,
            exit,
            initiallyTruncated: before.truncated,
            eventJournal,
            observationBuffer: observations,
            recordEvent,
            captureSnapshot,
            ...(signal === undefined ? {} : { signal }),
        });
    }
    catch (cause) {
        runtime?.terminal.kill("SIGKILL");
        executionFailure = normalizeCaptureFailure(cause, signal);
        if (runtime !== undefined &&
            observations.rendered_frames.state === "unavailable" &&
            observations.rendered_frames.reason.startsWith("Rendered terminal frames were not collected")) {
            try {
                observations.rendered_frames = {
                    state: "available",
                    value: await runtime.renderer.frames(),
                };
            }
            catch (renderCause) {
                const renderFailure = renderCause instanceof Error
                    ? renderCause.message
                    : "unknown failure";
                observations.rendered_frames = {
                    state: "unavailable",
                    reason: `Rendered terminal frame collection failed: ${renderFailure}`,
                };
            }
        }
    }
    return finishProcessRun({
        runtime,
        timers,
        runId,
        captureBaseline: ownershipBaseline,
        ...(cleanupHost === undefined ? {} : { cleanupHost }),
        temporaryRoot,
        scenario,
        samples,
        stopSampler,
        capture,
        executionFailure,
        observations,
        ...(actualRootPid === undefined ? {} : { rootPid: actualRootPid }),
    });
};
/** Execute one scenario through a typed expected-failure channel. */
export const captureProcessScenario = async (scenario, signal, platform = process.platform, environment = process.env, captureSnapshot = snapshotRoots, cleanupHost) => {
    const ownershipReason = processCaptureOwnershipUnavailableReason(platform);
    if (ownershipReason !== undefined)
        return err(new AnalysisCapabilityUnavailableError("rea-process", "capture_process_scenario", ownershipReason, { userMessage: ownershipReason }));
    try {
        assertNotCancelled(signal);
        const resolvedScenario = await resolveProcessScenarioRuntimePaths(scenario, environment);
        return ok(await runProcessScenario(resolvedScenario, signal, environment, platform, captureSnapshot, cleanupHost));
    }
    catch (cause) {
        const failure = normalizeCaptureFailure(cause, signal);
        const executionFailureReason = describeProcessCaptureExecutionFailure(cause);
        return err(failure instanceof ProcessCaptureError
            ? failure
            : new ProcessCaptureError("process capture failed", {
                cause,
                ...(executionFailureReason === undefined
                    ? {}
                    : { executionFailure: executionFailureReason }),
            }));
    }
};
