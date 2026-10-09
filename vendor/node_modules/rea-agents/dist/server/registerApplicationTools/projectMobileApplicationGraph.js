import { projectAndroidApplicationEvidence } from "../../application/android/AndroidApplicationService.js";
import { projectAppleApplicationEvidence } from "../../application/apple/AppleApplicationService.js";
import { APPLICATION_TOOL_CONTRACTS, applicationToolContract, } from "../../contracts/applicationToolContracts.js";
import { recordSessionEvidenceSources } from "../sessionEvidence.js";
import { logToolExecution } from "../toolLogging.js";
import { toolRegistrationOptions } from "../toolRegistrationOptions.js";
import { toCallToolResult } from "../toolResult.js";
import { recordResult } from "./helpers.js";
/** Register execution-free Android and Apple inventory projection tools. */
export const registerProjectMobileApplicationGraphTools = (server, options) => {
    registerProjection({
        server,
        options,
        contract: applicationToolContract("project_android_application_graph"),
        project: projectAndroidApplicationEvidence,
    });
    registerProjection({
        server,
        options,
        contract: applicationToolContract("project_apple_application_graph"),
        project: projectAppleApplicationEvidence,
    });
};
const registerProjection = (context) => {
    const { server, options, contract, project } = context;
    server.registerTool(contract.name, toolRegistrationOptions(contract), async (input) => {
        const result = await logToolExecution(options.logger, contract.name, () => Promise.resolve(project(input)));
        if (!result.ok)
            return toCallToolResult(result, contract);
        const recordedSources = recordSessionEvidenceSources(options.recordEvidence, inventoryEvidenceSources(input));
        if (!recordedSources.ok)
            return toCallToolResult(recordedSources, contract);
        return recordResult(options, contract, result.value);
    });
};
const inventoryEvidenceSources = (input) => {
    if (typeof input !== "object" ||
        input === null ||
        !("inventory_evidence" in input) ||
        !Array.isArray(input.inventory_evidence))
        return [];
    return input.inventory_evidence;
};
