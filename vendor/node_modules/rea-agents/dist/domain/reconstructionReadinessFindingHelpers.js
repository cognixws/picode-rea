export const addMissingEvidenceFindings = (findings, stageId, referencedIds, availableIds) => {
    for (const evidenceId of new Set(referencedIds))
        if (!availableIds.has(evidenceId))
            findings.push(readinessFinding("referenced-evidence-missing", stageId, "unknown", `Referenced Evidence is absent from the bundle: ${evidenceId}.`));
};
export const readinessFinding = (...[code, stageId, status, detail, evidenceIds = []]) => ({
    code,
    stage_id: stageId,
    status,
    detail,
    evidence_ids: [...new Set(evidenceIds)].sort(),
});
export const readinessFindingOrder = (left, right) => {
    const leftKey = `${left.stage_id}:${left.code}:${left.detail}`;
    const rightKey = `${right.stage_id}:${right.code}:${right.detail}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
};
