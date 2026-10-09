import { APPLICATION_TOOL_CONTRACTS } from "../../contracts/applicationToolContracts.js";
import { toEvidenceToolResult } from "../toolResult.js";
export const recordResult = (options, contract, evidence, unknownKind) => {
    const recorded = unknownKind === undefined
        ? options.recordEvidence?.(evidence)
        : options.recordEvidenceWithUnknown?.(evidence, unknownRegistration(evidence, unknownKind));
    return toEvidenceToolResult(evidence, contract, recorded);
};
const unknownRegistration = (evidence, kind) => ({
    question: kind === "application-version-comparison"
        ? "Which application entities remain unmatched or ambiguous across these versions?"
        : kind === "source-to-bundle-comparison"
            ? "Which historical source files remain unmatched or ambiguously mapped to the shipped bundle?"
            : "Which selected JavaScript export return shapes remain dynamic, incomplete, or ambiguously paired?",
    severity: "medium",
    domain: kind,
    supporting_evidence_ids: [evidence.evidence_id],
    contradicting_evidence_ids: [],
    required_authority: "shipped-artifact",
    required_confidence: "observed",
    required_environment: null,
    recommended_probes: [
        {
            operation: "analyze_javascript_application",
            rationale: "Repeat static reconstruction with complete artifacts and source maps when available.",
        },
        ...(kind === "application-version-comparison"
            ? [
                {
                    operation: "reconcile_javascript_runtime",
                    rationale: "Add passive runtime Evidence without promoting it to static fact.",
                },
            ]
            : []),
    ],
    relationships: [],
});
