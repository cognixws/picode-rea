import { z } from "zod";
import { AnalysisProtocolError } from "../domain/analysisErrorCore.js";
import {} from "../domain/analysisErrorBase.js";
import { createEvidence, } from "../domain/evidence.js";
import { jsonValueSchema } from "../domain/jsonValue.js";
import { err, ok } from "../domain/result.js";
import { requestInputError, workflowInputError } from "./workflowInputError.js";
/** Parse one inventory projection and wrap its deterministic result in Evidence. */
export const projectInventoryEvidence = (options) => {
    const parsed = options.schema.safeParse(options.rawInput);
    if (!parsed.success)
        return err(requestInputError(options.operation, parsed.error, options.rawInput));
    try {
        const result = options.project(parsed.data);
        const first = parsed.data.inventory_evidence[0];
        return ok(createEvidence(first?.subject === null || first?.subject === undefined
            ? undefined
            : {
                path: first.subject.local_path,
                sha256: result.root_sha256,
                format: options.subjectFormat(first),
            }, options.provider, {
            predicateType: options.predicateType,
            operation: options.operation,
            parameters: {
                inventory_evidence_ids: [...result.source_evidence_ids],
                ...("limits" in parsed.data && parsed.data.limits !== undefined
                    ? { limits: jsonValueSchema.parse(parsed.data.limits) }
                    : {}),
            },
            result: jsonValueSchema.parse(result),
            rawResult: null,
            confidence: "inferred",
            authority: "analyst-inference",
            environment: null,
            limitations: result.limitations,
            evidenceLinks: result.source_evidence_ids,
        }));
    }
    catch (cause) {
        return err(cause instanceof TypeError || cause instanceof z.ZodError
            ? workflowInputError(options.operation, cause)
            : new AnalysisProtocolError(options.protocolError, { cause }));
    }
};
