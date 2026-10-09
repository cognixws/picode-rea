/** Classify whole-file semantic coverage from parsing and value bounds. */
export const semanticCoverage = (parserPartial, resourceLimits = []) => resourceLimits.length > 0
    ? { status: "partial", omittedCount: null, resourceLimits }
    : { status: parserPartial ? "partial" : "complete", omittedCount: 0 };
/** Read typed resource-limit classifications from any coverage state. */
export const semanticCoverageResourceLimits = (coverage) => coverage.resourceLimits ?? [];
/** Classify one callable's direct-return coverage. */
export const semanticReturnCoverage = (retainedCount, parserPartial) => ({
    status: parserPartial ? "partial" : "complete",
    retainedCount,
    omittedCount: 0,
});
