import { HopperProcessError } from "../domain/hopperErrors.js";
import { ProviderCleanupError } from "../domain/providerCleanupError.js";
import { err, ok } from "../domain/result.js";
import { createOwnedHopperShutdownDiagnostic, providerCleanupFailure, } from "./HopperDiagnostics.js";
import { isHopperCleanupRequired, isHopperShutdownAcknowledgement, } from "./HopperSessionValues.js";
/** Close Hopper phases and retain every resource whose cleanup is unverified. */
export const cleanupHopperSession = async (input) => {
    const state = {
        issues: [],
        resources: new Set(),
        cleanupResult: undefined,
        shutdownConfirmed: false,
    };
    await report(input.progress, 0, input.retainDocument && input.launch?.preparedImagePath === undefined
        ? "detaching REA from the Hopper document"
        : "requesting Hopper document shutdown");
    await requestShutdown(input, state);
    await report(input.progress, 0.35, "releasing Hopper bridge transport");
    input.releaseTransport(input.socket);
    await stopProcess(input, state);
    recordUnconfirmedDocument(input, state);
    await report(input.progress, 0.75, "removing Hopper private runtime files");
    if (input.launch?.preparedImagePath !== undefined &&
        !state.shutdownConfirmed) {
        const resource = input.runtimeRoot?.path ?? input.launch.preparedImagePath;
        state.resources.add(resource);
        state.issues.push({
            resource,
            reason: "Prepared image retained because native document closure was not confirmed",
        });
    }
    else {
        await closeRuntimeRoot(input.runtimeRoot, state);
    }
    return cleanupOutcome(input, state);
};
const requestShutdown = async (input, state) => {
    if (input.socket === undefined ||
        input.socket.destroyed ||
        input.activeRequest !== null) {
        if (input.activeRequest !== null)
            input.logger.warn({
                method: input.activeRequest.operation,
                callerState: input.activeRequest.callerState,
            }, "Hopper shutdown skipped because a bridge operation remained active");
        return;
    }
    const method = (input.retainDocument && input.launch?.preparedImagePath === undefined) ||
        input.launch?.shutdownMode === "process-cleanup"
        ? "shutdown"
        : "shutdown_document";
    const shutdown = await input
        .request(method)
        .catch((cause) => err(shutdownRequestFailure(method, cause)));
    if (shutdown.ok &&
        isHopperCleanupRequired(shutdown.value) &&
        input.launch?.shutdownMode === "process-cleanup") {
        state.cleanupResult = await input.launch
            .cleanup()
            .catch(providerCleanupFailure);
        if (!state.cleanupResult.cleaned) {
            state.shutdownConfirmed = await fallbackDocumentShutdown(input);
            state.cleanupResult = await input.launch
                .cleanup()
                .catch(providerCleanupFailure);
        }
    }
    else if (shutdown.ok) {
        state.shutdownConfirmed = isHopperShutdownAcknowledgement(shutdown.value);
    }
    if (!shutdown.ok ||
        (!state.shutdownConfirmed && state.cleanupResult === undefined))
        input.logger.warn({
            status: shutdown.ok ? "invalid-acknowledgement" : "failed",
            ...(shutdown.ok ? {} : shutdownFailureDetails(shutdown.error)),
        }, "Hopper document shutdown was not confirmed");
};
const fallbackDocumentShutdown = async (input) => {
    const fallback = await input
        .request("shutdown_document")
        .catch((cause) => err(shutdownRequestFailure("shutdown_document", cause)));
    const confirmed = fallback.ok && isHopperShutdownAcknowledgement(fallback.value);
    if (!confirmed)
        input.logger.warn({
            status: fallback.ok ? "invalid-acknowledgement" : "failed",
            ...(fallback.ok ? {} : shutdownFailureDetails(fallback.error)),
        }, "Hopper document shutdown fallback was not confirmed");
    return confirmed;
};
const shutdownRequestFailure = (operation, cause) => {
    const failure = new HopperProcessError(null, undefined, operation);
    failure.cause = cause;
    return failure;
};
const shutdownFailureDetails = (error) => ({
    errorTag: error._tag,
    ...(error instanceof HopperProcessError && error.operation !== undefined
        ? { operation: error.operation }
        : {}),
    ...(error instanceof HopperProcessError && error.requestId !== undefined
        ? { requestId: error.requestId }
        : {}),
    ...(error.cause === undefined
        ? {}
        : { failure_cause: describeFailureCause(error.cause) }),
});
const describeFailureCause = (cause) => {
    if (cause instanceof Error) {
        const code = "code" in cause ? cause.code : undefined;
        return {
            name: cause.name,
            message: cause.message,
            ...(typeof code === "string" ||
                (typeof code === "number" && Number.isFinite(code))
                ? { code }
                : {}),
        };
    }
    if (typeof cause === "string")
        return { type: "string", message: cause };
    if (cause === null ||
        typeof cause === "boolean" ||
        (typeof cause === "number" && Number.isFinite(cause)))
        return { type: cause === null ? "null" : typeof cause, value: cause };
    return { type: typeof cause };
};
const stopProcess = async (input, state) => {
    const supervisor = input.processSupervisor;
    if (supervisor === undefined)
        return;
    const stopped = await supervisor.stop(state.cleanupResult === undefined
        ? {}
        : { cleanupResult: state.cleanupResult });
    const diagnostic = createOwnedHopperShutdownDiagnostic(supervisor.launch, stopped, state.cleanupResult);
    try {
        input.onDiagnostic?.(diagnostic);
    }
    catch (cause) {
        // Diagnostic consumers cannot change the already-observed cleanup result.
        void cause;
    }
    input.logger.info(diagnostic, "Owned Hopper launcher shutdown completed");
    if (stopped.status !== "incomplete") {
        if (input.launch?.shutdownMode === "process-cleanup" &&
            stopped.status !== "not-owned")
            state.shutdownConfirmed = true;
        return;
    }
    const processGroupId = supervisor.launch.ownership?.processGroupId;
    const resource = processGroupId === undefined
        ? "hopper-process"
        : `process-group:${String(processGroupId)}`;
    state.resources.add(resource);
    state.issues.push({ resource, reason: stopped.reason });
    input.logger.warn({ reason: stopped.reason }, "Owned launcher cleanup failed closed");
};
const recordUnconfirmedDocument = (input, state) => {
    if ((input.socket === undefined && input.launch === undefined) ||
        state.shutdownConfirmed)
        return;
    state.resources.add("hopper-document");
    state.issues.push({
        resource: "hopper-document",
        reason: input.activeRequest === null
            ? "authenticated shutdown acknowledgement was not observed"
            : `bridge operation ${input.activeRequest.operation} remained active after caller ${input.activeRequest.callerState}`,
    });
};
const closeRuntimeRoot = async (runtimeRoot, state) => {
    try {
        await runtimeRoot?.close();
    }
    catch (cause) {
        const resource = runtimeRoot?.path ?? "hopper-runtime-root";
        state.resources.add(resource);
        state.issues.push({
            resource,
            reason: cause instanceof Error
                ? cause.message
                : "private runtime root cleanup failed",
        });
    }
};
const cleanupOutcome = (input, state) => {
    if (state.issues.length === 0)
        return ok(null);
    return err(new ProviderCleanupError("hopper", [...state.resources], {
        issues: cleanupIssueDetails(state.issues),
        ...(input.runtimeRoot === undefined
            ? {}
            : { runtime_root: input.runtimeRoot.path }),
        ...(input.activeRequest === null
            ? {}
            : { active_request: activityDetails(input.activeRequest) }),
    }));
};
const cleanupIssueDetails = (issues) => issues.map((issue) => ({
    resource: issue.resource,
    reason: issue.reason,
}));
const activityDetails = (activity) => ({
    request_id: activity.requestId,
    operation: activity.operation,
    elapsed_ms: activity.elapsedMs,
    caller_state: activity.callerState,
    queued_requests: activity.queuedRequests,
});
const report = async (progress, completed, message) => {
    // best-effort cleanup: progress reporting must not fail session cleanup.
    await progress
        ?.report({
        phase: "hopper_cleanup",
        completed,
        total: 1,
        message,
    })
        .catch(() => undefined);
};
