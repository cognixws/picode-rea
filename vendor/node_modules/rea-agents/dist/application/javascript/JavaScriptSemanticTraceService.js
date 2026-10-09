import { z } from "zod";
import { AnalysisInputError, AnalysisProtocolError, } from "../../domain/analysisErrorCore.js";
import {} from "../../domain/analysisErrorBase.js";
import { jsonValueSchema } from "../../domain/jsonValue.js";
import { queryJavaScriptSemanticGraph } from "../../domain/javascript/javascriptSemanticQuery.js";
import { javaScriptSemanticTraceResultSchema, traceJavaScriptSemanticsInputSchema, } from "../../domain/javascript/javascriptSemanticTraceSchemas.js";
import { err, ok } from "../../domain/result.js";
import { parseApplicationGraphEvidence } from "./JavaScriptApplicationEvidenceGraph.js";
import { createJavaScriptSemanticTraceEvidence } from "./JavaScriptApplicationWorkflowEvidence.js";
const OPERATION = "trace_javascript_semantics";
/** Trace semantic relations from input already parsed by a trusted adapter. */
export const traceJavaScriptSemanticsEvidenceValidated = (input) => {
    try {
        const source = parseApplicationGraphEvidence(input.application);
        if (source.semanticGraph === null)
            return err(new AnalysisInputError(OPERATION, undefined, [
                {
                    path: ["application"],
                    reason: "invalid_value",
                    expected: "inline Evidence from analyze_javascript_application with a semantic graph",
                },
            ]));
        const query = queryJavaScriptSemanticGraph(source.semanticGraph, input.query);
        const result = javaScriptSemanticTraceResultSchema.parse({
            ...query,
            source_evidence_id: source.evidence.evidence_id,
            evidence_links: [source.evidence.evidence_id],
        });
        return ok(createJavaScriptSemanticTraceEvidence({
            application_evidence_id: source.evidence.evidence_id,
            query: jsonValueSchema.parse(input.query),
        }, result));
    }
    catch (cause) {
        return err(new AnalysisProtocolError("JavaScript semantic trace failed", { cause }));
    }
};
