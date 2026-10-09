import { z } from "zod";
import { AnalysisInputError } from "../domain/analysisErrorCore.js";
import { analysisInputErrorFromIssues } from "../domain/inputIssueProjection.js";
/** Project schema issues of the raw request onto their request paths. */
export const requestInputError = (operation, cause, input) => analysisInputErrorFromIssues(operation, cause.issues, input, { cause });
/**
 * Keep the failed constraint when a parsed request is rejected later. Nested
 * values such as Evidence results are parsed on their own, so their issue
 * paths are relative to that value and are reported in the message, not as
 * request paths.
 */
export const workflowInputError = (operation, cause) => new AnalysisInputError(operation, { cause }, cause instanceof z.ZodError
    ? cause.issues.map((issue) => ({
        path: [],
        reason: "invalid_value",
        message: `A nested value failed validation at ${issue.path.length === 0 ? "its root" : issue.path.map(String).join(".")}: ${issue.message}`,
    }))
    : [{ path: [], reason: "invalid_value", message: cause.message }]);
