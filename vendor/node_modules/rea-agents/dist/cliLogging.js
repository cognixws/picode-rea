import { analysisCliErrorEnvelopeSchema, analysisErrorProjectionSchema, } from "./contracts/errorSchemas.js";
import { AnalysisError } from "./domain/analysisErrorBase.js";
import { projectAnalysisError, } from "./domain/analysisErrorProjection.js";
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
/** Identify caller-visible CLI outcomes that mean the requested operation failed. */
export const isCliOperationFailure = (value) => {
    if (!isRecord(value))
        return false;
    if (isRecord(value.error) &&
        analysisErrorProjectionSchema.safeParse(value.error).success)
        return true;
    if (analysisCliErrorEnvelopeSchema.safeParse(value).success)
        return true;
    if (analysisErrorProjectionSchema.safeParse(value).success)
        return true;
    if (value.healthy === false)
        return true;
    return false;
};
/** Log one CLI command with duration and a stable success or failure status. */
export const logCliCommand = async (logger, command, execute, isCommandFailure) => {
    const startedAt = performance.now();
    try {
        const value = await execute();
        const failed = isCommandFailure?.(value) ?? isCliOperationFailure(value);
        logger[failed ? "error" : "info"]({
            command,
            durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
            status: failed ? "error" : "ok",
        }, failed ? "CLI command failed" : "CLI command completed");
        if (failed)
            process.exitCode = 1;
        return value;
    }
    catch (cause) {
        process.exitCode = 1;
        logger.error({
            command,
            durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
            status: "error",
        }, "CLI command failed");
        if (cause instanceof AnalysisError) {
            process.exitCode = 1;
            return projectAnalysisError(cause);
        }
        throw cause;
    }
};
