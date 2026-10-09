import { z } from "zod";
import { parseRelatedAddresses, referenceKindSchema, } from "../../domain/hopperValues.js";
import { err, ok } from "../../domain/result.js";
import { AnalysisOutputError } from "../../domain/analysisErrorCore.js";
const referencesSchema = z.object({
    reference_kinds_available: z.boolean().optional(),
    references: z.array(z.object({
        source_address: z.string(),
        target_address: z.string(),
        target_procedure: z.object({ address: z.string() }).nullable(),
        kind: referenceKindSchema,
    })),
    unresolved_calls: z
        .array(z.object({ address: z.string(), reason: z.string() }))
        .default([]),
});
/** Prefer typed static call references, preserving computed targets and targetless sites. */
export const readNativeCallRoutes = async (analysis, procedure, signal) => {
    const options = signal === undefined ? {} : { signal };
    const execution = await analysis.execute("procedure_references", { procedure, direction: "outgoing" }, options);
    if (execution.ok) {
        const parsed = referencesSchema.safeParse(execution.value.result);
        if (!parsed.success)
            return err(new AnalysisOutputError("procedure_references", "Invalid typed call references"));
        const references = parsed.data.references;
        if (parsed.data.reference_kinds_available === true ||
            (references.length > 0 && references.every(({ kind }) => kind.available))) {
            const calls = references.filter(({ kind }) => kind.available && kind.call);
            const countBySite = new Map();
            for (const call of calls) {
                const targets = countBySite.get(call.source_address) ?? new Set();
                targets.add(call.target_address);
                countBySite.set(call.source_address, targets);
            }
            return ok({
                provider: execution.value.provider,
                routes: calls.map((call) => ({
                    address: call.target_procedure?.address ?? call.target_address,
                    site: call.source_address,
                    relation: call.kind.available && (call.kind.computed || call.kind.indirect)
                        ? "indirect_call"
                        : "direct_call",
                    resolution: (countBySite.get(call.source_address)?.size ?? 0) > 1
                        ? "ambiguous"
                        : call.kind.available &&
                            (call.kind.computed || call.kind.indirect)
                            ? "resolved"
                            : "observed",
                })),
                unknowns: parsed.data.unresolved_calls,
            });
        }
    }
    else if (execution.error._tag !== "AnalysisCapabilityUnavailableError")
        return err(execution.error);
    const callees = await analysis.execute("procedure_callees", { procedure }, options);
    if (!callees.ok)
        return callees;
    const parsed = parseRelatedAddresses(callees.value.result, "callees");
    return parsed.ok
        ? ok({
            provider: callees.value.provider,
            routes: parsed.value.map((address) => ({
                address,
                site: procedure,
                relation: "provider_call",
                resolution: "inferred",
            })),
            unknowns: [],
        })
        : parsed;
};
