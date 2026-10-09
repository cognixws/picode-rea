const completeCoverage = () => ({
    status: "complete",
    truncated: false,
    omitted_count: 0,
    limits: [],
});
/** Preserve the source parser's coverage state on projected observations. */
export const managedSourceCoverage = (state) => state === "complete"
    ? completeCoverage()
    : {
        status: state,
        truncated: false,
        omitted_count: null,
        limits: [],
    };
/** Determine whether any supplied managed inspection was partial. */
export const assessManagedGraphOmissions = (sources) => ({
    partialInput: [
        sources.members?.coverage.state,
        sources.boundaries?.coverage.state,
        sources.artifact?.coverage.state,
    ].some((state) => state !== undefined && state !== "complete"),
});
/** Derive graph coverage solely from the coverage of supplied source evidence. */
export const managedGraphEvidenceCoverage = (omissions) => omissions.partialInput
    ? {
        status: "partial",
        truncated: false,
        omitted_count: null,
        limits: [],
    }
    : completeCoverage();
/** Report whether all supplied source evidence was complete. */
export const managedGraphResultCoverage = (omissions) => ({
    status: omissions.partialInput
        ? "partial"
        : "complete-within-inputs",
});
