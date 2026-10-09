import { optionalProviderUnavailable, } from "../application/OptionalObservationProviders.js";
import { err } from "../domain/result.js";
import { listJavaScriptRuntimeTargets, observeJavaScriptRuntime, } from "../application/javascript/JavaScriptRuntimeObservationService.js";
import { toolContract } from "../contracts/toolContracts.js";
import { observeJavaScriptRuntimeInputSchema } from "../domain/javascript/javascriptRuntimeObservation.js";
import { logToolExecution } from "./toolLogging.js";
import { toolRegistrationOptions } from "./toolRegistrationOptions.js";
import { toCallToolResult, toEvidenceToolResult } from "./toolResult.js";
/** Register passive Inspector tools even when policy keeps them unavailable. */
export const registerJavaScriptRuntimeObservationTools = (server, options) => {
    const listContract = toolContract("list_javascript_runtime_targets");
    const observeContract = toolContract("observe_javascript_runtime");
    server.registerTool(listContract.name, toolRegistrationOptions(listContract), (input, context) => runRuntimeTool(options, listContract, { input, context }, (parsed, signal) => listJavaScriptRuntimeTargets(options.runtime, parsed, { signal })));
    server.registerTool(observeContract.name, toolRegistrationOptions(observeContract), (input, context) => runRuntimeTool(options, observeContract, { input, context }, async (parsed, signal) => {
        const request = observeJavaScriptRuntimeInputSchema.parse(parsed);
        return observeJavaScriptRuntime(options.runtime, request, { signal });
    }));
};
const runRuntimeTool = async (options, contract, request, execute) => {
    const { input, context } = request;
    if (options.loadFailure !== undefined)
        return toCallToolResult(err(optionalProviderUnavailable(options.loadFailure, contract.name)), contract);
    const result = await logToolExecution(options.logger, contract.name, () => execute(input, context.mcpReq.signal));
    if (!result.ok)
        return toCallToolResult(result, contract);
    const recorded = options.recordEvidence?.(result.value);
    return toEvidenceToolResult(result.value, contract, recorded);
};
