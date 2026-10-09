import { toolContract } from "../contracts/toolContracts.js";
import { logToolExecution } from "./toolLogging.js";
import { toolRegistrationOptions } from "./toolRegistrationOptions.js";
import { toCallToolResult, toEvidenceToolResult } from "./toolResult.js";
/** Bind source point tracing to its exact named contract and session Evidence owner. */
export const registerWebSourceLocationTool = (server, service, logger, recordEvidence) => {
    const contract = toolContract("trace_web_source_location");
    server.registerTool(contract.name, toolRegistrationOptions(contract), async (input, context) => {
        const result = await logToolExecution(logger, contract.name, () => service.trace(input, { signal: context.mcpReq.signal }));
        if (!result.ok)
            return toCallToolResult(result, contract);
        const recorded = recordEvidence?.(result.value);
        return toEvidenceToolResult(result.value, contract, recorded);
    });
};
