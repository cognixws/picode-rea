import { z } from "zod";
import { AnalysisProtocolError } from "../../domain/analysisErrorCore.js";
import {} from "../../domain/analysisErrorBase.js";
import { createEvidence } from "../../domain/evidence.js";
import { jsonValueSchema } from "../../domain/jsonValue.js";
import { managedNativeVerificationInputSchema, verifyManagedNativeBoundaries, } from "../../domain/managed/managedNativeVerification.js";
import { err, ok } from "../../domain/result.js";
import { MANAGED_WORKFLOW_PROVIDER } from "../InvestigationProviders.js";
import { requestInputError, workflowInputError, } from "../workflowInputError.js";
const OPERATION = "verify_managed_native_boundaries";
/** Verify managed/native boundary declarations against native Evidence. */
export const verifyManagedNativeBoundariesEvidence = (rawInput) => {
    const parsed = managedNativeVerificationInputSchema.safeParse(rawInput);
    if (!parsed.success)
        return err(requestInputError(OPERATION, parsed.error, rawInput));
    try {
        const result = verifyManagedNativeBoundaries(parsed.data);
        return ok(createManagedNativeVerificationEvidence(parsed.data, result));
    }
    catch (cause) {
        return err(cause instanceof TypeError || cause instanceof z.ZodError
            ? workflowInputError(OPERATION, cause)
            : new AnalysisProtocolError("Managed/native verification produced an invalid result", { cause }));
    }
};
const createManagedNativeVerificationEvidence = (input, result) => createEvidence(undefined, MANAGED_WORKFLOW_PROVIDER, {
    predicateType: "rea.managed-native-verification",
    operation: OPERATION,
    parameters: {
        managed_boundaries_evidence_id: input.managed_boundaries.evidence_id,
        native_evidence_ids: jsonValueSchema.parse(input.native_observations.map(({ evidence_id: id }) => id)),
    },
    result: jsonValueSchema.parse(result),
    rawResult: null,
    confidence: "inferred",
    authority: "analyst-inference",
    environment: null,
    limitations: result.limitations,
    evidenceLinks: result.evidence_links,
});
