import { evaluateProcessTraceSide, processTraceComparisonResultSchema, } from "./processTraceEvaluation.js";
import { processTraceSpecificationSchema, } from "./processTraceSpecification.js";
export { processTraceComparisonResultSchema, } from "./processTraceEvaluation.js";
export { processTraceSpecificationSchema, } from "./processTraceSpecification.js";
/** Compare two captures against an explicit finite trace language. */
export const compareProcessTraces = (left, right, specificationInput) => {
    const specification = processTraceSpecificationSchema.parse(specificationInput);
    const leftEvaluation = evaluateProcessTraceSide(left, specification);
    const rightEvaluation = evaluateProcessTraceSide(right, specification);
    const diagnostic = leftEvaluation.diagnostic === null
        ? rightEvaluation.diagnostic === null
            ? null
            : { side: "right", ...rightEvaluation.diagnostic }
        : { side: "left", ...leftEvaluation.diagnostic };
    const outcomesDiffer = leftEvaluation.result.status !== rightEvaluation.result.status ||
        JSON.stringify(leftEvaluation.result.raw_trace.map(({ event_id }) => event_id)) !==
            JSON.stringify(rightEvaluation.result.raw_trace.map(({ event_id }) => event_id));
    return processTraceComparisonResultSchema.parse({
        verdict: leftEvaluation.result.status === "unknown" ||
            rightEvaluation.result.status === "unknown"
            ? "unknown"
            : leftEvaluation.result.status === "pass" &&
                rightEvaluation.result.status === "pass"
                ? "equivalent"
                : outcomesDiffer
                    ? "different"
                    : "nonconforming",
        left: leftEvaluation.result,
        right: rightEvaluation.result,
        diagnostic,
    });
};
/** Whether trace conformance or raw declared order differs across captures. */
export const processTraceOutcomesDiffer = (comparison) => comparison.left.status !== comparison.right.status ||
    JSON.stringify(comparison.left.raw_trace.map(({ event_id }) => event_id)) !==
        JSON.stringify(comparison.right.raw_trace.map(({ event_id }) => event_id));
