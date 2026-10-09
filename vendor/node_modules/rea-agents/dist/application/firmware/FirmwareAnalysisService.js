import { firmwareRequestSchema, } from "../../domain/firmware/firmwareAnalysis.js";
import { AnalysisCancelledError, AnalysisInputError, AnalysisOutputError, } from "../../domain/analysisErrorCore.js";
import { createEvidence } from "../../domain/evidence.js";
import { jsonObjectSchema } from "../../domain/jsonValue.js";
import { err, ok } from "../../domain/result.js";
/** Shared CLI/MCP validation and Evidence composition for arbitrary firmware files. */
export class FirmwareAnalysisService {
    provider;
    constructor(provider) {
        this.provider = provider;
    }
    /** Execute an explicit inspection or extraction and preserve its producing identity. */
    async execute(operation, input, options) {
        if (options?.signal?.aborted === true)
            return err(new AnalysisCancelledError(operation));
        const parsed = firmwareRequestSchema.safeParse({ operation, input });
        if (!parsed.success)
            return err(new AnalysisInputError(operation, { cause: parsed.error }));
        const executed = await this.provider.execute(parsed.data, options);
        if (!executed.ok)
            return executed;
        const execution = executed.value;
        if (execution.subject === null)
            return err(new AnalysisOutputError(operation, "Firmware execution did not bind its source artifact"));
        return ok(createEvidence(execution.subject, execution.provider, {
            operation,
            parameters: jsonObjectSchema.parse(parsed.data.input),
            result: execution.result,
            rawResult: execution.rawResult,
            locations: execution.locations,
            limitations: execution.limitations,
            confidence: "observed",
        }));
    }
}
