import { canonicalDigest } from "../comparisonSemantics.js";
import { uniqueSorted } from "../canonicalOrdering.js";
import { buildJavaScriptApplicationChangeGraph } from "./javascriptApplicationChangeGraph.js";
import { applicationVersionComparisonResultSchema, } from "./javascriptApplicationVersionComparisonSchemas.js";
import { classifyJavaScriptApplicationVersions } from "./javascriptApplicationVersionItems.js";
import { matchJavaScriptApplicationVersions } from "./javascriptApplicationVersionKeys.js";
/** Compare application entities with ordered unique-only identity tiers. */
export const compareJavaScriptApplicationVersions = (input) => {
    const matching = matchJavaScriptApplicationVersions(input.left.graph.nodes, input.right.graph.nodes);
    const projection = classifyJavaScriptApplicationVersions(matching, {
        leftGraph: input.left.graph,
        rightGraph: input.right.graph,
        leftEvidenceId: input.left.evidenceId,
        rightEvidenceId: input.right.evidenceId,
        leftNativeEvidence: input.leftNativeEvidence,
        rightNativeEvidence: input.rightNativeEvidence,
    });
    const changeGraph = buildJavaScriptApplicationChangeGraph({
        left: input.left.graph,
        right: input.right.graph,
        leftEvidenceId: input.left.evidenceId,
        rightEvidenceId: input.right.evidenceId,
        items: projection.items,
    });
    const evidenceLinks = uniqueSorted(projection.items.flatMap(({ evidence_links: links }) => links));
    const omissions = {
        left_graph_omitted_count: input.left.graph.coverage.omitted_count,
        right_graph_omitted_count: input.right.graph.coverage.omitted_count,
    };
    const coverage = comparisonCoverage(input, omissions);
    const semantic = {
        left: {
            evidence_id: input.left.evidenceId,
            graph_id: input.left.graph.graph_id,
            root_artifact_sha256: input.left.rootArtifactSha256,
        },
        right: {
            evidence_id: input.right.evidenceId,
            graph_id: input.right.graph.graph_id,
            root_artifact_sha256: input.right.rootArtifactSha256,
        },
        summary: summary(projection.items),
        matching: matchingSummary(projection.items),
        items: projection.items,
        graph: changeGraph.graph,
        coverage,
        evidence_links: evidenceLinks,
        limitations: comparisonLimitations(input),
    };
    return applicationVersionComparisonResultSchema.parse({
        ...semantic,
        comparison_id: `javc_${canonicalDigest(semantic, "Application version comparison")}`,
    });
};
const summary = (items) => ({
    unchanged: countStatus(items, "unchanged"),
    added: countStatus(items, "added"),
    removed: countStatus(items, "removed"),
    changed: countStatus(items, "changed"),
    unknown: countStatus(items, "unknown"),
});
const countStatus = (items, status) => items.filter((item) => item.status === status).length;
const matchingSummary = (items) => ({
    exact_node_identity: countBasis(items, "exact-node-identity"),
    exact_content_digest: countBasis(items, "exact-content-digest"),
    exact_module_source_digest: countBasis(items, "exact-module-source-digest"),
    source_map_identity: countBasis(items, "source-map-identity"),
    structural_fingerprint: countBasis(items, "structural-fingerprint"),
    semantic_key: countBasis(items, "semantic-key"),
    ambiguous: items.filter(({ match }) => match.status === "ambiguous").length,
    unmatched: items.filter(({ match }) => match.status === "unmatched").length,
});
const countBasis = (items, basis) => items.filter(({ match }) => match.basis === basis).length;
const comparisonCoverage = (input, omissions) => {
    const context = {
        left_graph_status: input.left.graph.coverage.status,
        right_graph_status: input.right.graph.coverage.status,
    };
    const sourceGraphsComplete = input.left.graph.coverage.status === "complete" &&
        input.right.graph.coverage.status === "complete";
    const sourceGraphsTruncated = input.left.graph.coverage.truncated || input.right.graph.coverage.truncated;
    return {
        ...context,
        ...omissions,
        status: sourceGraphsComplete
            ? "complete-within-inputs"
            : sourceGraphsTruncated
                ? "truncated"
                : "partial",
    };
};
const comparisonLimitations = (input) => uniqueSorted([
    "Application comparison never uses bundler module ordinals as persistent identity and performs no fuzzy pairing.",
    "Exact digest equality proves byte identity only; source-map, structural-fingerprint, and semantic-key matches retain inferred confidence.",
    "Minified names and chunk locations are not assumed stable across versions.",
    "The comparison reads retained graphs and Evidence only; it does not execute either application.",
    "Native Evidence is linked only by exact subject digest; provider snapshot reuse remains target/provider/profile exact.",
    ...(input.left.graph.coverage.status === "complete" &&
        input.right.graph.coverage.status === "complete"
        ? []
        : [
            "At least one source graph is incomplete; unmatched entities on the opposite side remain unknown rather than added or removed.",
        ]),
]);
