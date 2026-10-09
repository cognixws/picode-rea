import { uniqueSorted } from "../canonicalOrdering.js";
/** Classify a complete semantic traversal without promoting unknowns to absence. */
export const assessJavaScriptSemanticQuery = (input) => ({
    status: queryStatus(input),
    coverage: queryCoverage(input),
    limitations: queryLimitations(input),
});
const queryCoverage = (input) => ({
    status: input.graph.coverage.status === "unavailable"
        ? "unavailable"
        : input.unknowns.length > 0 ||
            input.candidateRelations > 0 ||
            input.graph.coverage.status !== "complete" ||
            input.graph.coverage.truncated
            ? "partial"
            : "complete",
});
const queryStatus = (input) => {
    if (input.graph.coverage.status === "unavailable")
        return "unsupported";
    if (input.candidateRelations > 0)
        return "ambiguous";
    if (input.totalSeeds === 0 ||
        (input.hasExpectation && input.expectedMatches === 0))
        return input.unknowns.length > 0 ||
            input.graph.coverage.status !== "complete" ||
            input.graph.coverage.truncated
            ? "partial"
            : "no-match";
    return input.totalSeeds > 1 ? "ambiguous" : "found";
};
const queryLimitations = (input) => uniqueSorted([
    "Semantic graph reachability is a static inference and does not prove runtime execution.",
    ...input.graph.limitations,
    ...(input.unknowns.length === 0
        ? []
        : [
            "Relevant dynamic, unsupported, incomplete, or ambiguous semantics remain unknown.",
        ]),
    ...(input.candidateRelations === 0
        ? []
        : [
            "Candidate relations remain ambiguous and do not establish a resolved semantic path.",
        ]),
]);
