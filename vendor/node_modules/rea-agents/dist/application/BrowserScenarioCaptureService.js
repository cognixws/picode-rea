import { createBrowserScenarioEvidence } from "./BrowserScenarioEvidence.js";
import { AnalysisCapabilityUnavailableError } from "../domain/analysisErrorCore.js";
import {} from "../domain/analysisErrorBase.js";
import { err } from "../domain/result.js";
const OPERATION = "capture_browser_scenario";
const PROVIDER_ID = "rea-playwright-browser-scenario";
/** Execute one controlled browser scenario using its explicit request scope. */
export const captureBrowserScenario = async (provider, scenario, options = {}) => {
    if (provider === undefined)
        return err(new AnalysisCapabilityUnavailableError(PROVIDER_ID, OPERATION, "browser scenario provider is not configured"));
    const captured = await provider.captureScenario(scenario, options);
    return captured.ok
        ? {
            ok: true,
            value: createBrowserScenarioEvidence(scenario, captured.value, provider.identity()),
        }
        : captured;
};
