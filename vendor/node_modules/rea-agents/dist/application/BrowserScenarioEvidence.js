import { canonicalDigest } from "../domain/comparisonSemantics.js";
import { sanitizeBrowserUrl } from "../domain/browserObservation.js";
import { createEvidence, } from "../domain/evidence.js";
import { jsonValueSchema } from "../domain/jsonValue.js";
const browserScenarioParameters = (scenario) => ({
    scenario_sha256: canonicalDigest(scenario, "Browser scenario"),
    browser_mode: scenario.browser.mode,
    ...(scenario.browser.mode === "launch"
        ? { browser_headless: scenario.browser.headless }
        : {}),
    start_url: sanitizeBrowserUrl(scenario.start_url.url),
    environment: scenario.environment,
    actions: scenario.actions.map(({ step_id, action }) => ({
        step_id,
        action,
    })),
    action_timeouts_ms: scenario.actions.map((item) => "timeout_ms" in item ? (item.timeout_ms ?? null) : null),
    secret_declarations: scenario.secrets.map(({ secret_id, environment_variable }) => ({
        secret_id,
        environment_variable,
    })),
    capture: scenario.capture,
});
/** Create Evidence without retaining resolved scenario secret values. */
export const createBrowserScenarioEvidence = (scenario, capture, provider) => createEvidence(undefined, provider, {
    predicateType: "rea.browser-scenario-capture",
    operation: "capture_browser_scenario",
    parameters: browserScenarioParameters(scenario),
    result: jsonValueSchema.parse(capture),
    confidence: "observed",
    authority: "controlled-replay",
    environment: {
        id: `${capture.browser.product}@${capture.browser.version}`,
        platform: "unknown",
        architecture: "unknown",
        isolation: capture.browser.process_ownership === "provider-owned"
            ? "process"
            : "none",
    },
    limitations: [
        ...capture.limitations,
        "Browser host platform and architecture were not observed.",
    ],
});
