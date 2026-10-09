import { toolContract } from "../contracts/toolContracts.js";
import { logToolExecution } from "./toolLogging.js";
import { toolRegistrationOptions } from "./toolRegistrationOptions.js";
import { toCallToolResult, toEvidenceToolResult } from "./toolResult.js";
/** Bind the named EVM contract to shared validation and session Evidence recording. */
export const registerEvmTools = (server, service, logger, recordEvidence) => {
    const contract = toolContract("inspect_evm_interface");
    server.registerTool(contract.name, toolRegistrationOptions(contract), async (input, context) => {
        const result = await logToolExecution(logger, contract.name, () => service.inspect(input, { signal: context.mcpReq.signal }));
        if (!result.ok)
            return toCallToolResult(result, contract);
        const recorded = recordEvidence?.(result.value);
        return toEvidenceToolResult(result.value, contract, recorded);
    });
};
