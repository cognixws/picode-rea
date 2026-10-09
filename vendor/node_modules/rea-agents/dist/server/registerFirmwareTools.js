import { toolContract } from "../contracts/toolContracts.js";
import { logToolExecution } from "./toolLogging.js";
import { toolRegistrationOptions } from "./toolRegistrationOptions.js";
import { toCallToolResult, toEvidenceToolResult } from "./toolResult.js";
/** Bind firmware handlers to their exact named schemas. */
export const registerFirmwareTools = (server, service, logger, recordEvidence) => {
    const handler = (contract) => async (input, context) => {
        const result = await logToolExecution(logger, contract.name, () => service.execute(contract.name, input, {
            signal: context.mcpReq.signal,
        }));
        if (!result.ok)
            return toCallToolResult(result, contract);
        const recorded = recordEvidence?.(result.value);
        return toEvidenceToolResult(result.value, contract, recorded);
    };
    const inspect = toolContract("inspect_firmware_regions");
    server.registerTool(inspect.name, toolRegistrationOptions(inspect), handler(inspect));
    const extract = toolContract("extract_firmware");
    server.registerTool(extract.name, toolRegistrationOptions(extract), handler(extract));
};
