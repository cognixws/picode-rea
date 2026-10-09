import { canonicalDigest } from "./comparisonSemantics.js";
export const dimensionResult = (input) => {
    const context = {
        dimension: input.dimension,
        left_digest: digest(input.left),
        right_digest: digest(input.right),
        left_count: input.leftCount,
        right_count: input.rightCount,
        text_delta: input.textDelta,
        evidence_links: [...input.links],
        limitations: [...input.limitations],
    };
    if (input.status === "unchanged")
        return {
            ...context,
            status: "unchanged",
            conclusion_kind: "derived_relationship",
        };
    return {
        ...context,
        status: "changed",
        conclusion_kind: input.providersDiffer
            ? "contradiction"
            : "derived_relationship",
    };
};
export const unresolvedDimension = (input) => ({
    dimension: input.dimension,
    status: input.status,
    left_digest: null,
    right_digest: null,
    left_count: input.leftCount,
    right_count: input.rightCount,
    text_delta: null,
    conclusion_kind: "unresolved_branch",
    evidence_links: [...input.links],
    limitations: [...input.limitations],
});
export const overallStatus = (dimensions, match) => {
    if (dimensions.some(({ status }) => status === "truncated"))
        return "truncated";
    if (match === "ambiguous" ||
        dimensions.some(({ status }) => status === "unknown"))
        return "unknown";
    if (match === "mismatched")
        return "changed";
    return dimensions.some(({ status }) => status === "changed")
        ? "changed"
        : "unchanged";
};
export const summarize = (dimensions) => ({
    unchanged: dimensions.filter(({ status }) => status === "unchanged").length,
    changed: dimensions.filter(({ status }) => status === "changed").length,
    truncated: dimensions.filter(({ status }) => status === "truncated").length,
    unknown: dimensions.filter(({ status }) => status === "unknown").length,
});
const digest = (value) => canonicalDigest(value, "Function comparison");
