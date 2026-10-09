import { EvidenceIntegrityError } from "../../domain/evidenceErrors.js";
import {} from "../../domain/analysisErrorBase.js";
import { err, ok } from "../../domain/result.js";
import { recordDerivedEvidence } from "../recordDerivedEvidence.js";
export const isIncomplete = (status) => status === "unknown" || status === "truncated";
export const comparisonClosure = (comparisons) => uniqueIds(comparisons.flatMap((evidence) => [
    evidence.evidence_id,
    ...evidence.evidence_links,
]));
export const functionEvidenceIds = (records) => uniqueIds(records.map(({ evidence_id }) => evidence_id));
const uniqueIds = (ids) => [...new Set(ids)].sort((left, right) => left.localeCompare(right));
export const evidenceClosure = (session, seedIds) => {
    const records = new Map(session
        .exportEvidenceBundle()
        .records.map((evidence) => [evidence.evidence_id, evidence]));
    const visited = new Set();
    const pending = [...seedIds];
    while (pending.length > 0) {
        const evidenceId = pending.pop();
        if (evidenceId === undefined || visited.has(evidenceId))
            continue;
        const evidence = records.get(evidenceId);
        if (evidence === undefined)
            return err(new EvidenceIntegrityError("Investigation input has a dangling Evidence link"));
        visited.add(evidenceId);
        pending.push(...evidence.evidence_links);
    }
    return ok(uniqueIds([...visited]));
};
export const recordWorkflowEvidence = (...[session, evidence, unresolved, input]) => {
    if (!unresolved) {
        return recordDerivedEvidence(session, evidence, undefined);
    }
    return recordDerivedEvidence(session, evidence, {
        question: input.question,
        severity: "high",
        domain: input.domain,
        supporting_evidence_ids: [evidence.evidence_id],
        contradicting_evidence_ids: [],
        required_authority: input.requiredAuthority,
        required_confidence: input.requiredConfidence,
        required_environment: null,
        recommended_probes: [...input.probes],
        relationships: [],
    });
};
