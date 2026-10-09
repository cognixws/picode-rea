import { parseBinaryTarget } from "../BinaryTargetResolver.js";
import { androidRequestSchema, } from "../../domain/android/androidAnalysis.js";
import { AnalysisCancelledError, AnalysisInputError, } from "../../domain/analysisErrorCore.js";
import { createEvidence } from "../../domain/evidence.js";
import { jsonObjectSchema } from "../../domain/jsonValue.js";
import { err, ok } from "../../domain/result.js";
/** Shared CLI/MCP admission, execution and Evidence composition for Android. */
export class AndroidAnalysisService {
    provider;
    constructor(provider) {
        this.provider = provider;
    }
    /** Inspect a caller-selected APK and retain producing-provider provenance inline. */
    async execute(operation, input, options) {
        if (options?.signal?.aborted === true)
            return err(new AnalysisCancelledError(operation));
        const request = androidRequestSchema.safeParse({ operation, input });
        if (!request.success)
            return err(new AnalysisInputError(operation, { cause: request.error }));
        const target = await parseBinaryTarget(request.data.input.path);
        if (!target.ok)
            return target;
        const executed = await this.provider.execute(target.value, request.data, options);
        if (!executed.ok)
            return executed;
        const execution = executed.value;
        return ok(createEvidence(execution.subject ?? target.value, execution.provider, {
            operation,
            parameters: jsonObjectSchema.parse(request.data.input),
            result: execution.result,
            rawResult: execution.rawResult,
            limitations: execution.limitations,
            locations: execution.locations,
            confidence: operation === "inspect_android_method" ? "derived" : "observed",
        }));
    }
}
