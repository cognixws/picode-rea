import { z } from "zod";
import { browserScenarioDiffSchema, compareBrowserScenarios, compareBrowserScenariosInputSchema, } from "./browserScenarioDiff.js";
import { compareWebCaptures, captureSnapshotSchema, webCaptureDiffSchema, } from "./webCaptureDiff.js";
/** Caller-visible object schema for passive and scenario capture comparisons. */
export const browserCaptureComparisonInputSchema = z
    .strictObject({
    before: captureSnapshotSchema
        .optional()
        .describe("Earlier passive web-page capture."),
    after: captureSnapshotSchema
        .optional()
        .describe("Later passive web-page capture."),
    before_scenario: compareBrowserScenariosInputSchema.shape.before_scenario
        .optional()
        .describe("Earlier browser scenario capture."),
    after_scenario: compareBrowserScenariosInputSchema.shape.after_scenario
        .optional()
        .describe("Later browser scenario capture."),
    normalization: compareBrowserScenariosInputSchema.shape.normalization
        .unwrap()
        .optional()
        .describe("Exact-literal normalization policy."),
})
    .superRefine((input, context) => {
    const passive = input.before !== undefined && input.after !== undefined;
    const scenario = input.before_scenario !== undefined && input.after_scenario !== undefined;
    const passiveFieldsPresent = input.before !== undefined || input.after !== undefined;
    const scenarioFieldsPresent = input.before_scenario !== undefined ||
        input.after_scenario !== undefined ||
        input.normalization !== undefined;
    if (passive && !scenarioFieldsPresent)
        return;
    if (scenario && !passiveFieldsPresent)
        return;
    context.addIssue({
        code: "custom",
        message: "Provide before and after passive captures, or before_scenario, after_scenario, and normalization; do not mix comparison types.",
    });
});
/** Result from passive page or browser scenario comparison. */
export const browserCaptureComparisonSchema = z.union([
    browserScenarioDiffSchema,
    webCaptureDiffSchema,
]);
/** Dispatch a parsed capture comparison to its pure domain comparator. */
export const compareBrowserCaptures = (input) => isScenarioComparison(input)
    ? compareBrowserScenarios({
        ...input,
        normalization: input.normalization ?? { rules: [] },
    })
    : compareWebCaptures(toPassiveComparison(input));
const isScenarioComparison = (input) => input.before_scenario !== undefined && input.after_scenario !== undefined;
const toPassiveComparison = (input) => {
    if (input.before === undefined || input.after === undefined)
        throw new Error("Validated passive comparison is missing a capture");
    return { before: input.before, after: input.after };
};
