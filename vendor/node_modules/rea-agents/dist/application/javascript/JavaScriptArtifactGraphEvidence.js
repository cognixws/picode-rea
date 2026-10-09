const EXTRACTOR = {
    name: "rea-javascript-artifact-reconstruction",
    version: "1",
    executable_sha256: null,
};
/** Exact artifact-byte evidence for one safely inventoried local file. */
export const artifactObservationEvidence = (input) => ({
    authority: "artifact-bytes",
    state: "observed",
    confidence: "exact",
    artifact: artifactReference(input.sha256),
    location: {
        available: true,
        value: { kind: "artifact-path", path: input.path },
    },
    extractor: { ...EXTRACTOR, operation: input.operation },
    coverage: input.coverage,
    limitations: [...(input.limitations ?? [])],
    evidence_ids: [],
});
/** Exact AST syntax evidence with an actionable source range. */
export const astObservationEvidence = (input) => {
    const limitations = [
        ...(input.limitations ?? []),
        ...(input.coverage.status === "complete"
            ? []
            : [
                "AST coverage is incomplete; omitted or dynamic facts must not be interpreted as absence.",
            ]),
    ];
    return {
        authority: "ast-static-analysis",
        state: "observed",
        confidence: "exact",
        artifact: artifactReference(input.sha256),
        location: {
            available: true,
            value: { kind: "source-range", source: input.path, ...input.range },
        },
        extractor: { ...EXTRACTOR, operation: input.operation },
        coverage: input.coverage,
        limitations,
        evidence_ids: [],
    };
};
/** Explicit static relationship inference; never promoted to observation. */
export const staticInferenceEvidence = (input) => ({
    authority: "static-relationship-inference",
    state: "inferred",
    confidence: input.confidence ?? "high",
    artifact: artifactReference(input.sha256),
    location: input.range === undefined
        ? { available: true, value: { kind: "artifact-path", path: input.path } }
        : {
            available: true,
            value: { kind: "source-range", source: input.path, ...input.range },
        },
    extractor: { ...EXTRACTOR, operation: input.operation },
    coverage: input.coverage,
    limitations: [
        "Static syntax does not prove that this relationship executes at runtime.",
        ...(input.limitations ?? []),
    ],
    evidence_ids: [],
});
/** Unavailable AST fact that preserves a parse, approval, or limit gap. */
export const unavailableAstEvidence = (input) => ({
    authority: "ast-static-analysis",
    state: "unavailable",
    confidence: "unknown",
    artifact: artifactReference(input.sha256),
    location: {
        available: true,
        value: { kind: "artifact-path", path: input.path },
    },
    extractor: { ...EXTRACTOR, operation: input.operation },
    coverage: input.coverage,
    limitations: [input.limitation, ...(input.limitations ?? [])],
    evidence_ids: [],
});
const artifactReference = (sha256) => ({
    available: true,
    artifact_id: `art_${sha256}`,
    sha256,
});
