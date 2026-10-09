import { z } from "zod";
import { OFFICIAL_TOOL_CONTRACTS } from "../contracts/officialToolContracts.js";
import { createEvidence } from "../domain/evidence.js";
import { jsonObjectSchema, jsonValueSchema, } from "../domain/jsonValue.js";
import { mcpProgressReporter } from "./mcpProgress.js";
import { logToolExecution } from "./toolLogging.js";
import { toolRegistrationOptions } from "./toolRegistrationOptions.js";
import { toCallToolResult, toEvidenceToolResult } from "./toolResult.js";
/** Register direct bridge proxies, preserving MCP cancellation and typed errors. */
export const registerOfficialTools = (server, analysis, options) => {
    for (const contract of OFFICIAL_TOOL_CONTRACTS) {
        registerOfficialTool(server, analysis, contract, {
            logger: options.logger,
            activeTarget: options.activeTarget,
            recordEvidence: options.recordEvidence,
        });
    }
};
const registerOfficialTool = (server, analysis, contract, registration) => {
    server.registerTool(contract.name, toolRegistrationOptions(contract), async (input, context) => {
        const arguments_ = projectOfficialArguments(contract, input);
        const progress = mcpProgressReporter(context);
        const result = await runOfficialOperation(analysis, contract, arguments_, {
            logger: registration.logger,
            signal: context.mcpReq.signal,
            progress,
        });
        if (!result.ok) {
            return toCallToolResult(result, contract);
        }
        const evidence = createEvidence(result.value.subject ?? registration.activeTarget?.(), result.value.provider, {
            operation: contract.name,
            parameters: arguments_,
            result: result.value.result,
            ...(result.value.analysisProfile === undefined
                ? {}
                : { analysisProfile: result.value.analysisProfile }),
            rawResult: result.value.rawResult,
            limitations: result.value.limitations,
            locations: result.value.locations,
        });
        const recorded = registration.recordEvidence?.(evidence);
        return toEvidenceToolResult(evidence, contract, recorded);
    });
};
const runOfficialOperation = async (analysis, contract, arguments_, execution) => {
    await execution.progress.report({
        phase: contract.name,
        completed: 0,
        total: 1,
        message: "started",
    });
    const result = await logToolExecution(execution.logger, contract.name, () => analysis.execute(contract.name, arguments_, {
        signal: execution.signal,
        progress: execution.progress,
    }));
    await execution.progress.report({
        phase: contract.name,
        completed: 1,
        total: 1,
        message: result.ok ? "completed" : "failed",
        terminal: true,
    });
    return result;
};
const projectOfficialArguments = (contract, input) => {
    // Annotation omissions preserve existing values; they are not Python defaults.
    if (contract.name === "annotate_native_function")
        return jsonObjectSchema.parse(contract.inputSchema.parse(input));
    const parsed = jsonObjectSchema.parse(input);
    if (!(contract.inputSchema instanceof z.ZodObject))
        throw new TypeError("Official tool input contract must be an object schema");
    const projected = {};
    for (const key of Object.keys(contract.inputSchema.shape)) {
        projected[key] = jsonValueSchema.parse(parsed[key] ?? null);
    }
    return projected;
};
