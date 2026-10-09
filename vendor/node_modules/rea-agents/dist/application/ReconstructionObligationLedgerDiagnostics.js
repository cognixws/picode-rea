export const groupManifestBindings = (manifest) => {
    const grouped = new Map();
    for (const binding of manifest.bindings)
        grouped.set(binding.obligation_id, [
            ...(grouped.get(binding.obligation_id) ?? []),
            binding,
        ]);
    return grouped;
};
export const groupManifestContradictions = (manifest) => {
    const grouped = new Map();
    for (const contradiction of manifest.contradictions)
        grouped.set(contradiction.obligation_id, [
            ...(grouped.get(contradiction.obligation_id) ?? []),
            ...contradiction.evidence_ids,
        ]);
    return grouped;
};
export const addObligationDiagnostic = (diagnostics, code, detail) => {
    diagnostics.push({ code, detail });
};
export const uniqueObligationDiagnostics = (diagnostics) => [
    ...new Map(diagnostics.map((diagnostic) => [
        `${diagnostic.code}:${diagnostic.detail}`,
        diagnostic,
    ])).values(),
].sort((left, right) => `${left.code}:${left.detail}`.localeCompare(`${right.code}:${right.detail}`));
export const hasObligationDiagnostic = (diagnostics, code) => diagnostics.some((diagnostic) => diagnostic.code === code);
export const contradictionDiagnostics = (obligationId, contradictions, evidenceById) => {
    const evidenceIds = contradictions.get(obligationId) ?? [];
    if (evidenceIds.length === 0)
        return [];
    const missing = evidenceIds.filter((evidenceId) => !evidenceById.has(evidenceId));
    return missing.length > 0
        ? [
            {
                code: "contradiction-evidence-missing",
                detail: `Contradiction references missing Evidence: ${missing.join(", ")}.`,
            },
        ]
        : [
            {
                code: "contradiction",
                detail: "Authenticated contradictory Evidence reopens this obligation.",
            },
        ];
};
