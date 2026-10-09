const clauseFlagsIssue = (region) => [0, 1, 2, 4].includes(region.flags)
    ? null
    : `Exception clause has unsupported flags 0x${region.flags.toString(16)}`;
const methodExtentIssue = (start, length, ilSize, name) => start <= ilSize && length <= ilSize - start
    ? null
    : `Exception clause ${name} range leaves the method IL body`;
const instructionBoundaryIssue = (start, length, boundaries, name) => {
    const end = start + length;
    return boundaries.has(start) && boundaries.has(end)
        ? null
        : `Exception clause ${name} range does not align with CIL instruction boundaries`;
};
const filterOrderingIssue = (region, ilSize) => {
    if (region.flags !== 1)
        return null;
    const offset = region.filter_offset;
    return offset !== null && offset < ilSize && offset < region.handler_offset
        ? null
        : "Exception clause filter must start before its handler within the method IL body";
};
const clauseIssue = (region, ilSize, boundaries) => clauseFlagsIssue(region) ??
    methodExtentIssue(region.try_offset, region.try_length, ilSize, "try") ??
    instructionBoundaryIssue(region.try_offset, region.try_length, boundaries, "try") ??
    methodExtentIssue(region.handler_offset, region.handler_length, ilSize, "handler") ??
    instructionBoundaryIssue(region.handler_offset, region.handler_length, boundaries, "handler") ??
    (region.flags === 1 && region.filter_offset !== null
        ? instructionBoundaryIssue(region.filter_offset, 0, boundaries, "filter")
        : null) ??
    filterOrderingIssue(region, ilSize);
/** Validate EH extents and instruction boundaries while retaining each clause. */
export const validateExceptionRegionRanges = (parsed, ilSize, instructionOffsets) => {
    if (parsed.status === "malformed")
        return parsed;
    const boundaries = new Set([...instructionOffsets, ilSize]);
    for (const region of parsed.regions) {
        const issue = clauseIssue(region, ilSize, boundaries);
        if (issue !== null)
            return { status: "malformed", regions: parsed.regions, issue };
    }
    return parsed;
};
