import { canonicalDigest } from "../../domain/comparisonSemantics.js";
import { createEvidence } from "../../domain/evidence.js";
import { jsonValueSchema } from "../../domain/jsonValue.js";
/** Create Evidence without retaining arbitrary runtime argument values. */
export const createElectronActiveEvidence = (input, result, provider) => createEvidence(undefined, provider, {
    predicateType: "rea.electron-active-scenario",
    operation: "capture_electron_scenario",
    parameters: parameters(input),
    result: jsonValueSchema.parse(result),
    confidence: "observed",
    authority: "controlled-replay",
    environment: {
        id: `${result.application.electron_version}@unknown`,
        platform: "unknown",
        architecture: "unknown",
        isolation: "none",
    },
    limitations: [
        ...result.limitations,
        "Application host platform and architecture were not observed.",
    ],
});
const scenarioProjection = (input) => ({
    executable_path: input.executable_path,
    application_path: input.application_path,
    application_root: input.application_root,
    args: [...input.args],
    actions: input.actions.map(({ step_id, kind }) => ({ step_id, kind })),
});
const parameters = (input) => ({
    ...scenarioProjection(input),
    scenario_sha256: canonicalDigest(scenarioProjection(input), "Browser scenario"),
});
