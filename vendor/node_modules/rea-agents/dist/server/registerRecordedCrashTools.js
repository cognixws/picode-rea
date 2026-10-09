import { toolContract } from "../contracts/toolContracts.js";
import { logToolExecution } from "./toolLogging.js";
import { toolRegistrationOptions } from "./toolRegistrationOptions.js";
import { toCallToolResult, toEvidenceToolResult } from "./toolResult.js";
/** Bind recorded crash inspection to its named contract and session Evidence owner. */
export const registerRecordedCrashTools = (server, service, logger, recordEvidence) => {
    const contract = toolContract("inspect_recorded_crash");
    server.registerTool(contract.name, toolRegistrationOptions(contract), async (input, context) => {
        const result = await logToolExecution(logger, contract.name, () => service.inspect(input, { signal: context.mcpReq.signal }));
        if (!result.ok)
            return toCallToolResult(result, contract);
        const recorded = recordEvidence?.(result.value);
        return toEvidenceToolResult(result.value, contract, recorded);
    });
};
