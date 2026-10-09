import { parseConfig } from "../config.js";
import { EnhancedTools } from "./EnhancedTools.js";
import { executeFunctionAnalysisEvidence } from "./FunctionAnalysisEvidence.js";
import { silentLogger } from "../logger.js";
import { createEvidence } from "../domain/evidence.js";
import { isManagedToolName, } from "../contracts/managed/managedToolContracts.js";
import { EvidenceIntegrityError } from "../domain/evidenceErrors.js";
import { projectAnalysisError } from "../domain/analysisErrorProjection.js";
import {} from "../domain/analysisErrorBase.js";
import { access } from "node:fs/promises";
import { readAnalysisSnapshot, writeAnalysisSnapshot, } from "./binary/AnalysisSnapshotFiles.js";
import { parseBinaryTarget } from "./BinaryTargetResolver.js";
import { snapshotEvidenceForQuery, snapshotMatchesTarget, } from "../domain/analysisSnapshot.js";
import { err, ok } from "../domain/result.js";
import { REA_WORKFLOW_PROVIDER, workflowAnalysisProfile, } from "./InvestigationProviders.js";
import { createWorkflowEvidence, workflowSnapshotRecord, recordWorkflowUnknowns, } from "./WorkflowEvidence.js";
import { artifactInspectionResultSchema } from "../domain/artifactInspection.js";
/**
 * Open one binary, execute one tool, and always release provider resources.
 * Unlike MCP mode, every CLI invocation is intentionally isolated and does not
 * retain a target or provider client for a subsequent command.
 */
export const runDirectAnalysis = async (dependencies, path, tool, arguments_, options = {}) => withProcessCancellation(options.signal, (signal) => runAnalysis(dependencies, path, tool, arguments_, {
    logger: options.logger ?? silentLogger,
    snapshotPath: options.snapshotPath,
    signal,
    ...(options.formatHint === undefined
        ? {}
        : { formatHint: options.formatHint }),
    ...(options.providerId === undefined
        ? {}
        : { providerId: options.providerId }),
}));
/** Execute one provider-native semantic operation with atomic provenance. */
export const runProviderAnalysis = async (dependencies, ...[path, tool, arguments_, logger = silentLogger, signal]) => isManagedToolName(tool)
    ? runManagedProviderAnalysis(dependencies, path, tool, signal)
    : withProcessCancellation(signal, (operationSignal) => runAnalysis(dependencies, path, tool, arguments_, {
        logger,
        snapshotPath: undefined,
        signal: operationSignal,
    }));
/** Execute managed metadata inspection in an isolated managed-only session. */
export const runManagedProviderExecution = async (dependencies, path, tool, signal) => withProcessCancellation(signal, async (operationSignal) => {
    const session = dependencies.createManagedBinarySession();
    try {
        const opened = await session.open(path, { signal: operationSignal });
        if (!opened.ok)
            return opened;
        return await session.execute(tool, {}, { signal: operationSignal });
    }
    finally {
        await session.close();
    }
});
const runManagedProviderAnalysis = async (dependencies, path, tool, signal) => {
    const execution = await runManagedProviderExecution(dependencies, path, tool, signal);
    if (!execution.ok)
        return cliError(execution.error);
    const value = execution.value;
    return createEvidence(value.subject ?? undefined, value.provider, {
        operation: tool,
        parameters: {},
        result: value.result,
        rawResult: value.rawResult,
        limitations: value.limitations,
        locations: value.locations,
    });
};
const runAnalysis = async (dependencies, path, tool, arguments_, options) => {
    const { logger, signal, snapshotPath } = options;
    const config = parseConfig(options.environment ?? process.env);
    if (!config.ok)
        return cliError(config.error);
    const session = dependencies.createBinarySession(config.value, logger);
    try {
        const prepared = await prepareSnapshot({
            path,
            snapshotPath,
            ...(options.formatHint === undefined
                ? {}
                : { formatHint: options.formatHint }),
        });
        if (!prepared.ok)
            return cliError(prepared.error);
        const { snapshot } = prepared.value;
        let resolvedTarget;
        if (snapshot !== undefined && prepared.value.target !== undefined) {
            const preview = await session.previewTarget(prepared.value.target, {
                signal,
                snapshot,
                ...(options.formatHint === undefined
                    ? {}
                    : { formatHint: options.formatHint }),
                ...(options.providerId === undefined
                    ? {}
                    : { providerId: options.providerId }),
            });
            if (!preview.ok)
                return cliError(preview.error);
            resolvedTarget = preview.value;
            const route = preview.value.route;
            const bindingProfile = route.profile ?? undefined;
            const evidenceProfile = analysisProfileForRoute(route, tool);
            if (bindingProfile !== undefined &&
                evidenceProfile !== undefined &&
                allowsSnapshotReplay(route, tool)) {
                const cached = snapshotEvidenceForQuery(snapshot, {
                    target: preview.value.target,
                    bindingProfile,
                    operation: tool,
                    parameters: arguments_,
                    provider: isWorkflowEvidenceTool(tool)
                        ? REA_WORKFLOW_PROVIDER
                        : providerIdentityForRoute(route, tool),
                    evidenceProfile,
                });
                if (cached !== undefined)
                    return cached;
            }
        }
        const openOptions = {
            signal,
            ...(options.formatHint === undefined
                ? {}
                : { formatHint: options.formatHint }),
            ...(snapshot === undefined ? {} : { snapshot }),
            ...(options.providerId === undefined
                ? {}
                : { providerId: options.providerId }),
        };
        const opened = resolvedTarget === undefined
            ? await session.open(path, openOptions)
            : await session.openResolvedTarget(resolvedTarget, openOptions);
        if (!opened.ok)
            return cliError(opened.error);
        const evidenceProfile = analysisProfileForEvidence(session, tool);
        const { output, evidence } = await executeAnalysisTool({
            session,
            openedTarget: opened.value,
            tool,
            arguments: arguments_,
            signal,
            evidenceProfile,
        });
        if (evidence !== undefined) {
            const recorded = session.recordEvidence(evidence);
            if (!recorded.ok)
                return cliError(recorded.error);
            if (isWorkflowEvidenceTool(tool)) {
                const unknowns = recordWorkflowUnknowns({
                    name: tool,
                    result: evidence.normalized_result,
                    evidenceId: evidence.evidence_id,
                    recordUnknown: (unknown) => session.recordUnknown(unknown),
                });
                if (!unknowns.ok)
                    return cliError(unknowns.error);
            }
        }
        if (isWorkflowEvidenceTool(tool) &&
            tool !== "trace_native_ui_action" &&
            snapshotPath !== undefined &&
            evidence !== undefined &&
            session.allowsSnapshotReplay(tool)) {
            const workflowRecord = workflowSnapshotRecord(evidence, tool);
            if (workflowRecord !== undefined) {
                const recorded = session.recordWorkflowSnapshot(workflowRecord);
                if (!recorded.ok)
                    return cliError(recorded.error);
            }
        }
        if (tool !== "trace_native_ui_action" &&
            snapshotPath !== undefined &&
            evidence !== undefined) {
            const snapshot = session.exportAnalysisSnapshot();
            if (!snapshot.ok)
                return cliError(snapshot.error);
            const written = await writeAnalysisSnapshot(snapshot.value, snapshotPath, true);
            if (!written.ok)
                return cliError(written.error);
        }
        return output;
    }
    finally {
        await session.close();
    }
};
const executeAnalysisTool = async (input) => {
    const { session, tool, signal, evidenceProfile } = input;
    if (tool === "analyze_function") {
        const result = await executeFunctionAnalysisEvidence(session, input.arguments, input.openedTarget, { signal });
        return result.ok
            ? { output: result.value, evidence: result.value }
            : { output: cliError(result.error) };
    }
    if (tool === "binary_overview" ||
        tool === "inspect_native_api" ||
        tool === "inspect_native_dispatch_metadata" ||
        tool === "trace_feature" ||
        tool === "trace_native_values" ||
        tool === "trace_native_ui_action") {
        const result = await new EnhancedTools(session).execute(tool, input.arguments, signal);
        if (!result.ok)
            return { output: cliError(result.error) };
        const evidence = createWorkflowEvidence({
            target: input.openedTarget,
            operation: tool,
            parameters: input.arguments,
            result: result.value,
            upstreamProfile: evidenceProfile,
        });
        return { output: evidence, evidence };
    }
    const result = await session.execute(tool, input.arguments, { signal });
    if (!result.ok)
        return { output: cliError(result.error) };
    const evidence = createEvidence(result.value.subject ?? input.openedTarget, result.value.provider, {
        operation: tool,
        parameters: input.arguments,
        result: result.value.result,
        ...(result.value.analysisProfile === undefined
            ? {}
            : { analysisProfile: result.value.analysisProfile }),
        rawResult: result.value.rawResult,
        limitations: result.value.limitations,
        locations: result.value.locations,
        evidenceLinks: tool === "inspect_artifact"
            ? artifactInspectionResultSchema.parse(result.value.result)
                .evidence_links
            : [],
    });
    return { output: evidence, evidence };
};
const withProcessCancellation = async (suppliedSignal, operation) => {
    if (suppliedSignal !== undefined)
        return operation(suppliedSignal);
    const controller = new AbortController();
    const cancel = () => controller.abort();
    process.once("SIGINT", cancel);
    try {
        return await operation(controller.signal);
    }
    finally {
        process.off("SIGINT", cancel);
    }
};
const prepareSnapshot = async (options) => {
    const { path, snapshotPath } = options;
    if (snapshotPath === undefined || !(await fileExists(snapshotPath)))
        return ok({});
    const loaded = await readAnalysisSnapshot(snapshotPath);
    if (!loaded.ok)
        return loaded;
    const target = await parseBinaryTarget(path, process.cwd(), process.arch, undefined, options.formatHint);
    if (!target.ok)
        return target;
    if (!snapshotMatchesTarget(loaded.value.target, target.value))
        return err(new EvidenceIntegrityError("Analysis snapshot target does not match the requested binary"));
    return ok({ snapshot: loaded.value, target: target.value });
};
const allowsSnapshotReplay = (route, tool) => {
    if (tool === "trace_native_ui_action")
        return false;
    const descriptor = route.capabilities?.get(tool);
    return descriptor === undefined
        ? ![...(route.capabilities?.values() ?? [])].some(({ cachePolicy }) => cachePolicy === "live")
        : descriptor.cachePolicy !== "live";
};
const analysisProfileForRoute = (route, tool) => {
    const profile = route.profile;
    if (profile === null || profile === undefined)
        return undefined;
    if (isWorkflowEvidenceTool(tool))
        return workflowAnalysisProfile(profile, tool);
    const provider = providerIdentityForRoute(route, tool);
    return provider.id === profile.provider.id ? profile : undefined;
};
/** Mirror BinarySession.providerIdentity for a route not opened yet. */
const providerIdentityForRoute = (route, operation) => {
    const selected = route.capabilities?.get(operation)?.provider ?? route.identity;
    return route.profile?.provider.id === selected.id
        ? route.profile.provider
        : selected;
};
const analysisProfileForEvidence = (session, tool) => {
    if (!isWorkflowEvidenceTool(tool))
        return session.analysisProfile(tool);
    return session.analysisProfile();
};
const isWorkflowEvidenceTool = (tool) => tool === "binary_overview" ||
    tool === "inspect_native_api" ||
    tool === "inspect_native_dispatch_metadata" ||
    tool === "trace_feature" ||
    tool === "trace_native_values" ||
    tool === "trace_native_ui_action";
const fileExists = async (path) => {
    try {
        await access(path);
        return true;
    }
    catch (cause) {
        if (typeof cause === "object" &&
            cause !== null &&
            "code" in cause &&
            cause.code === "ENOENT")
            return false;
        throw cause;
    }
};
const cliError = (error) => ({
    error: "Analysis failed",
    ...projectAnalysisError(error),
});
