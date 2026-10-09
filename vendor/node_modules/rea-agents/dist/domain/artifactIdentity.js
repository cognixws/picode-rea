import { canonicalDigest } from "./comparisonSemantics.js";
/** Content-address an artifact independently of where it was observed. */
export const artifactIdForContent = (sha256) => `art_${canonicalDigest({ sha256 }, "Artifact")}`;
/** Identify an occurrence by its root and exact logical location. */
export const occurrenceIdForLocation = (input) => input.logicalPath === "."
    ? `occ_${canonicalDigest({ root: input.rootArtifactId }, "Artifact")}`
    : `occ_${canonicalDigest({
        root_artifact_id: input.rootArtifactId,
        logical_path: input.logicalPath,
        entry_kind: input.entryKind,
    }, "Artifact")}`;
/** Commit to graph members in the ordering established by the inventory owner. */
export const artifactGraphDigest = (input) => canonicalDigest({
    nodes: input.nodes,
    occurrences: input.occurrences,
    edges: input.edges,
    integrity_contradictions: input.contradictions,
}, "Artifact");
/** Bind a root artifact to its graph commitment. */
export const artifactManifestId = (rootArtifactId, graphSha256) => `agm_${canonicalDigest({ root_artifact_id: rootArtifactId, graph_sha256: graphSha256 }, "Artifact")}`;
/** Identify one integrity disagreement at its observed logical path. */
export const artifactContradictionId = (input) => `ic_${canonicalDigest({
    root_artifact_id: input.rootArtifactId,
    logical_path: input.logicalPath,
    declared_sha256: input.declaredSha256,
    observed_sha256: input.observedSha256,
}, "Artifact")}`;
/** Identify an edge by its semantic relationship and exact occurrence. */
export const artifactEdgeId = (semantic) => `edge_${canonicalDigest(semantic, "Artifact")}`;
