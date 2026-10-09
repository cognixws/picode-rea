import { optionalProviderUnavailable, } from "../application/OptionalObservationProviders.js";
import { err } from "../domain/result.js";
import { analyzeWebBundle, captureWebScreenshot, compareWebCaptureEvidence, compareWebScreenshotEvidence, discoverWebMcpTools, inspectWebPage, listBrowserTargets, observeWebSession, } from "../application/BrowserObservationService.js";
import { toolContract } from "../contracts/toolContracts.js";
import { analyzeWebBundleInputSchema } from "../domain/webBundleAnalysis.js";
import { inspectWebPageInputSchema } from "../domain/browserObservation.js";
import { mcpProgressReporter } from "./mcpProgress.js";
import { logToolExecution } from "./toolLogging.js";
import { toolRegistrationOptions } from "./toolRegistrationOptions.js";
import { toCallToolResult, toEvidenceToolResult } from "./toolResult.js";
/** Register browser tools with execution-time provider diagnostics. */
// oxlint-disable-next-line max-lines-per-function -- direct SDK calls retain each schema-handler type correlation.
export const registerBrowserTools = (server, options) => {
    const listContract = toolContract("list_browser_targets");
    const inspectContract = toolContract("inspect_web_page");
    const analyzeContract = toolContract("analyze_web_bundle");
    const sessionContract = toolContract("observe_web_session");
    const webMcpContract = toolContract("discover_webmcp_tools");
    const captureDiffContract = toolContract("compare_web_captures");
    const screenshotContract = toolContract("capture_web_screenshot");
    const screenshotDiffContract = toolContract("compare_web_screenshots");
    server.registerTool(listContract.name, toolRegistrationOptions(listContract), (input, context) => runBrowserTool(options, listContract, { input, context }, (parsed, { signal }) => listBrowserTargets(options.browser, parsed, {
        signal,
    })));
    server.registerTool(inspectContract.name, toolRegistrationOptions(inspectContract), (input, context) => runBrowserTool(options, inspectContract, { input, context }, (parsed, { signal, progress }) => inspectWebPage(options.browser, inspectWebPageInputSchema.parse(parsed), { signal, progress })));
    server.registerTool(analyzeContract.name, toolRegistrationOptions(analyzeContract), (input, context) => runBrowserTool(options, analyzeContract, { input, context }, (parsed, { signal, progress }) => analyzeWebBundle(options.browser, analyzeWebBundleInputSchema.parse(parsed), {
        signal,
        progress,
    })));
    server.registerTool(sessionContract.name, toolRegistrationOptions(sessionContract), (input, context) => runBrowserTool(options, sessionContract, { input, context }, (parsed, { signal, progress }) => observeWebSession(options.browser, parsed, {
        signal,
        progress,
    })));
    server.registerTool(webMcpContract.name, toolRegistrationOptions(webMcpContract), (input, context) => runBrowserTool(options, webMcpContract, { input, context }, (parsed, { signal, progress }) => discoverWebMcpTools(options.browser, parsed, {
        signal,
        progress,
    })));
    server.registerTool(captureDiffContract.name, toolRegistrationOptions(captureDiffContract), (input, context) => runBrowserTool(options, captureDiffContract, { input, context }, (parsed) => compareWebCaptureEvidence(options.browser, parsed)));
    server.registerTool(screenshotContract.name, toolRegistrationOptions(screenshotContract), (input, context) => runBrowserTool(options, screenshotContract, { input, context }, (parsed, { signal, progress }) => captureWebScreenshot(options.browser, parsed, {
        signal,
        progress,
    })));
    server.registerTool(screenshotDiffContract.name, toolRegistrationOptions(screenshotDiffContract), (input, context) => runBrowserTool(options, screenshotDiffContract, { input, context }, (parsed) => compareWebScreenshotEvidence(options.browser, parsed)));
};
const runBrowserTool = async (options, contract, request, execute) => {
    const { input, context } = request;
    if (options.loadFailure !== undefined)
        return toCallToolResult(err(optionalProviderUnavailable(options.loadFailure, contract.name)), contract);
    const result = await logToolExecution(options.logger, contract.name, () => execute(input, {
        signal: context.mcpReq.signal,
        progress: mcpProgressReporter(context),
    }));
    if (!result.ok)
        return toCallToolResult(result, contract);
    return evidenceResult(options, contract, result.value);
};
const evidenceResult = (options, contract, evidence) => {
    const recorded = options.recordEvidence?.(evidence);
    return toEvidenceToolResult(evidence, contract, recorded);
};
