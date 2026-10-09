import { AnalysisOutputError } from "../domain/analysisErrorCore.js";
import { err, ok } from "../domain/result.js";
/** Resolve a caller selector to an observed provider procedure identity. */
export const resolveProcedureAddress = async (call, procedure, signal) => {
    const result = await call("procedure_address", { procedure }, signal);
    if (!result.ok)
        return result;
    return typeof result.value === "string" && result.value.length > 0
        ? ok(result.value)
        : err(new AnalysisOutputError("procedure_address", "provider returned no canonical procedure address"));
};
