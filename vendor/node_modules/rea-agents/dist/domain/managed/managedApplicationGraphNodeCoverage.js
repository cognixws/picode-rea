/** Derive module coverage from the best available managed evidence source. */
export const moduleCoverageState = (parsed) => parsed.artifact !== null && parsed.artifact.result.module !== null
    ? parsed.artifact.result.coverage.state
    : parsed.members !== null && parsed.members.result.module !== null
        ? parsed.members.result.coverage.state
        : (parsed.boundaries?.result.coverage.state ?? "complete");
