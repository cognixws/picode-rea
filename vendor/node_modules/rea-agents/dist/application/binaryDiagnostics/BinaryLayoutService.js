import { isAbsolute } from "node:path";
import { AnalysisCancelledError, AnalysisInputError, AnalysisOutputError, } from "../../domain/analysisErrorCore.js";
import { createEvidence } from "../../domain/evidence.js";
import { inspectBinaryLayoutInputSchema, binaryLayoutSchema, } from "../../domain/native/binaryLayout.js";
import { analysisInputErrorFromIssues } from "../../domain/inputIssueProjection.js";
import { err, ok } from "../../domain/result.js";
const OPERATION = "inspect_binary_layout";
/** Shared CLI/MCP validation and Evidence composition for offline layout inspection. */
export class BinaryLayoutService {
    provider;
    constructor(provider) {
        this.provider = provider;
    }
    /** Bind complete observations to the caller-selected artifact before creating Evidence. */
    async inspect(rawInput, options) {
        if (options?.signal?.aborted)
            return err(new AnalysisCancelledError(OPERATION));
        const input = inspectBinaryLayoutInputSchema.safeParse(rawInput);
        if (!input.success)
            return err(analysisInputErrorFromIssues(OPERATION, input.error.issues, rawInput, {
                cause: input.error,
            }));
        if (!isAbsolute(input.data.path))
            return err(new AnalysisInputError(OPERATION, undefined, [
                {
                    path: ["path"],
                    reason: "invalid_format",
                    message: "Expected an absolute filesystem path on this host.",
                },
            ]));
        const inspected = await this.provider.inspect(input.data, options);
        if (!inspected.ok)
            return inspected;
        const diagnostics = binaryLayoutSchema.shape.diagnostics.safeParse(inspected.value.diagnostics);
        const outputOptions = diagnostics.success
            ? { capturedOutput: diagnostics.data }
            : undefined;
        if (options?.signal?.aborted)
            return err(new AnalysisCancelledError(OPERATION, outputOptions));
        const report = binaryLayoutSchema.safeParse(inspected.value);
        if (!report.success || report.data.artifact.path !== input.data.path)
            return err(new AnalysisOutputError(OPERATION, "Binary layout provider returned malformed evidence or changed the selected artifact identity.", outputOptions));
        const value = report.data;
        return ok(createEvidence({
            path: value.artifact.path,
            format: "elf",
            architecture: "x86_64",
            sha256: value.artifact.sha256,
        }, this.provider.identity, {
            operation: OPERATION,
            parameters: input.data,
            result: value,
            rawResult: value,
            confidence: "observed",
            limitations: value.limitations,
            locations: [{ kind: "artifact-path", path: value.artifact.path }],
        }));
    }
}
