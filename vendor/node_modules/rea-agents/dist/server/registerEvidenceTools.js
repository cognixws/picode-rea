import { createEvidence } from "../domain/evidence.js";
import { jsonObjectSchema } from "../domain/jsonValue.js";
import { mcpProgressReporter } from "./mcpProgress.js";
import { logToolExecution } from "./toolLogging.js";
import { toolRegistrationOptions } from "./toolRegistrationOptions.js";
import { toCallToolResult, toEvidenceToolResult } from "./toolResult.js";
import { createArtifactExtractionDestination } from "../application/artifacts/ArtifactExtractionDestination.js";
/** Register provider-backed contracts that return atomic Evidence observations. */
export const registerEvidenceTools = (server, analysis, contracts, options) => {
    for (const contract of contracts) {
        server.registerTool(contract.name, toolRegistrationOptions(contract), async (input, context) => {
            const progress = mcpProgressReporter(context);
            await progress.report({
                phase: contract.name,
                completed: 0,
                total: 1,
                message: "started",
            });
            const parameters = jsonObjectSchema.parse(input);
            const executionParameters = contract.name === "extract_artifact"
                ? {
                    ...parameters,
                    output_root: createArtifactExtractionDestination(),
                }
                : parameters;
            const execution = await logToolExecution(options.logger, contract.name, () => analysis.execute(contract.name, executionParameters, {
                signal: context.mcpReq.signal,
                progress,
            }));
            await progress.report({
                phase: contract.name,
                completed: 1,
                total: 1,
                message: execution.ok ? "completed" : "failed",
                terminal: true,
            });
            if (!execution.ok)
                return toCallToolResult(execution, contract);
            const sourceEvidence = options.sourceEvidence?.(contract.name, execution.value.result) ?? [];
            const evidence = createEvidence(execution.value.subject ?? options.activeTarget?.(), execution.value.provider, {
                operation: contract.name,
                parameters,
                result: execution.value.result,
                ...(execution.value.analysisProfile === undefined
                    ? {}
                    : { analysisProfile: execution.value.analysisProfile }),
                rawResult: execution.value.rawResult,
                limitations: execution.value.limitations,
                locations: execution.value.locations,
                evidenceLinks: sourceEvidence.map(({ evidence_id: id }) => id),
            });
            for (const source of sourceEvidence) {
                const sourceRecorded = options.recordEvidence?.(source);
                if (sourceRecorded !== undefined && !sourceRecorded.ok)
                    return toCallToolResult(sourceRecorded, contract);
            }
            const recorded = options.recordEvidence?.(evidence);
            return toEvidenceToolResult(evidence, contract, recorded);
        });
    }
};
