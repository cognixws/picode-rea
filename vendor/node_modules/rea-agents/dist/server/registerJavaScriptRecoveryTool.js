import { toolContract } from "../contracts/toolContracts.js";
import { logToolExecution } from "./toolLogging.js";
import { toolRegistrationOptions } from "./toolRegistrationOptions.js";
import { toCallToolResult, toEvidenceToolResult } from "./toolResult.js";
/** Bind optional recovery to its exact named contract without acquiring an engine. */
export const registerJavaScriptRecoveryTool = (server, service, logger, recordEvidence) => {
    const contract = toolContract("recover_javascript_sources");
    server.registerTool(contract.name, toolRegistrationOptions(contract), async (input, context) => {
        const result = await logToolExecution(logger, contract.name, () => service.recover(input, { signal: context.mcpReq.signal }));
        if (!result.ok)
            return toCallToolResult(result, contract);
        const recorded = recordEvidence?.(result.value);
        return toEvidenceToolResult(result.value, contract, recorded);
    });
};
