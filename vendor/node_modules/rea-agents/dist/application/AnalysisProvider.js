import { jsonValueSchema } from "../domain/jsonValue.js";
/** Build a validated atomic provider observation at an adapter boundary. */
export const createAnalysisExecution = (result, provider, options = {}) => ({
    result: jsonValueSchema.parse(result),
    rawResult: options.rawResult === undefined
        ? jsonValueSchema.parse(result)
        : jsonValueSchema.parse(options.rawResult),
    provider,
    ...(options.analysisProfile === undefined
        ? {}
        : { analysisProfile: structuredClone(options.analysisProfile) }),
    limitations: [...(options.limitations ?? [])],
    locations: [...(options.locations ?? [])],
    subject: options.subject ?? null,
});
