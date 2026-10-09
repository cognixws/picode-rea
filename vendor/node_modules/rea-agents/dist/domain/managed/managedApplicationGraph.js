import { createHash } from "node:crypto";
import canonicalize from "canonicalize";
import { z } from "zod";
import { evidenceSchema } from "../evidence.js";
import { createJavaScriptApplicationGraph, javascriptApplicationGraphSchema, } from "../javascript/javascriptApplicationGraph.js";
import { managedArtifactInspectionSchema, managedMemberInspectionSchema, managedNativeBoundaryInspectionSchema, } from "./managedArtifact.js";
import { assessManagedGraphOmissions, managedGraphEvidenceCoverage, managedGraphResultCoverage, } from "./managedApplicationGraphCoverage.js";
import { addArtifactNode, addArtifactIdentityNodes, addBoundaryNodes, addMemberNodes, } from "./managedApplicationGraphNodes.js";
import { digestSchema } from "../digests.js";
import { prefixedDigestSchema } from "../digests.js";
import { parseManagedInspectionEvidence } from "./managedInspectionEvidence.js";
const evidenceIdSchema = prefixedDigestSchema("ev");
const textSchema = z.string().min(1);
/** Authenticated managed Evidence records projected into the application graph. */
export const projectManagedApplicationGraphInputSchema = z
    .strictObject({
    managed_artifact: evidenceSchema.optional(),
    managed_members: evidenceSchema.optional(),
    managed_native_boundaries: evidenceSchema.optional(),
})
    .superRefine((input, context) => {
    if (input.managed_artifact === undefined &&
        input.managed_members === undefined &&
        input.managed_native_boundaries === undefined)
        context.addIssue({
            code: "custom",
            message: "At least one managed artifact, member, or native-boundary Evidence record is required",
        });
});
/** Managed-code projection result containing a validated application graph. */
export const managedApplicationGraphResultSchema = z.strictObject({
    projection_id: prefixedDigestSchema("magp"),
    root_artifact_sha256: digestSchema,
    source_evidence: z.strictObject({
        managed_artifact_evidence_id: evidenceIdSchema.nullable(),
        managed_members_evidence_id: evidenceIdSchema.nullable(),
        managed_native_boundaries_evidence_id: evidenceIdSchema.nullable(),
    }),
    summary: z.strictObject({
        graph_nodes: z.number().int().min(0),
        graph_edges: z.number().int().min(0),
        assemblies: z.number().int().min(0),
        modules: z.number().int().min(0),
        types: z.number().int().min(0),
        methods: z.number().int().min(0),
        fields: z.number().int().min(0),
        pinvoke_imports: z.number().int().min(0),
        native_implementations: z.number().int().min(0),
    }),
    graph: javascriptApplicationGraphSchema,
    coverage: z.strictObject({
        status: z.enum(["complete-within-inputs", "partial"]),
    }),
    evidence_links: z.array(evidenceIdSchema).min(1).max(3),
    limitations: z.array(textSchema),
});
const sha256 = (value) => {
    const serialized = canonicalize(value);
    if (serialized === undefined)
        throw new TypeError("Managed application graph canonicalization failed");
    return createHash("sha256").update(serialized).digest("hex");
};
/** Project authenticated managed Evidence records into the application graph. */
export const projectManagedApplicationGraph = (input) => {
    const parsed = parseManagedInputs(input);
    const artifactIdentity = chooseArtifact(parsed);
    assertSameArtifact(parsed, artifactIdentity.sha256);
    const evidenceLinks = [
        parsed.artifact?.evidence.evidence_id,
        parsed.members?.evidence.evidence_id,
        parsed.boundaries?.evidence.evidence_id,
    ].filter((id) => id !== undefined);
    const state = {
        nodes: [],
        edges: [],
        artifactSha256: artifactIdentity.sha256,
        artifactPath: artifactIdentity.path,
        evidenceLinks,
        typeNodes: new Map(),
        methodNodes: new Map(),
        fieldNodes: new Map(),
    };
    const artifactNode = addArtifactNode(state);
    addArtifactIdentityNodes(state, artifactNode, parsed);
    const memberCounts = addMemberNodes(state, artifactNode, parsed);
    const boundaryCounts = addBoundaryNodes(state, artifactNode, parsed);
    const omissions = omittedCounts(parsed);
    const limitations = projectionLimitations(parsed, omissions);
    const graph = createJavaScriptApplicationGraph({
        schema: "JavaScriptApplicationGraph",
        root_node_ids: [artifactNode.node_id],
        nodes: state.nodes,
        edges: state.edges,
        coverage: managedGraphEvidenceCoverage(omissions),
        limitations,
    });
    const withoutId = {
        root_artifact_sha256: state.artifactSha256,
        source_evidence: {
            managed_artifact_evidence_id: parsed.artifact?.evidence.evidence_id ?? null,
            managed_members_evidence_id: parsed.members?.evidence.evidence_id ?? null,
            managed_native_boundaries_evidence_id: parsed.boundaries?.evidence.evidence_id ?? null,
        },
        summary: {
            graph_nodes: graph.nodes.length,
            graph_edges: graph.edges.length,
            assemblies: parsed.artifact?.result.assembly === null ? 0 : 1,
            modules: parsed.artifact?.result.module === null ? 0 : 1,
            ...memberCounts,
            ...boundaryCounts,
        },
        graph,
        coverage: managedGraphResultCoverage(omissions),
        evidence_links: evidenceLinks,
        limitations,
    };
    return managedApplicationGraphResultSchema.parse({
        ...withoutId,
        projection_id: `magp_${sha256(withoutId)}`,
    });
};
const parseManagedInputs = (input) => ({
    artifact: input.managed_artifact === undefined
        ? null
        : parseManagedInspectionEvidence(input.managed_artifact, "inspect_managed_artifact", managedArtifactInspectionSchema),
    members: input.managed_members === undefined
        ? null
        : parseManagedInspectionEvidence(input.managed_members, "inspect_managed_members", managedMemberInspectionSchema),
    boundaries: input.managed_native_boundaries === undefined
        ? null
        : parseManagedInspectionEvidence(input.managed_native_boundaries, "inspect_managed_native_boundaries", managedNativeBoundaryInspectionSchema),
});
const chooseArtifact = (parsed) => {
    const result = parsed.artifact?.result ??
        parsed.members?.result ??
        parsed.boundaries?.result;
    if (result === undefined)
        throw new TypeError("Managed graph projection requires managed Evidence");
    return { sha256: result.artifact.sha256, path: result.artifact.path };
};
const assertSameArtifact = (parsed, sha256Value) => {
    for (const result of [
        parsed.artifact?.result,
        parsed.members?.result,
        parsed.boundaries?.result,
    ])
        if (result !== undefined && result.artifact.sha256 !== sha256Value)
            throw new TypeError("Managed graph projection inputs must describe the same artifact SHA-256");
};
const omittedCounts = (parsed) => assessManagedGraphOmissions({
    artifact: parsed.artifact?.result ?? null,
    members: parsed.members?.result ?? null,
    boundaries: parsed.boundaries?.result ?? null,
});
const projectionLimitations = (parsed, omissions) => [
    "Managed graph projection preserves static metadata observations only; it does not execute managed code, load assemblies, or map managed tokens to native addresses.",
    ...(parsed.members === null
        ? [
            "Managed member Evidence was not supplied; type, method, and field nodes are absent.",
        ]
        : []),
    ...(parsed.artifact === null
        ? [
            "Managed artifact Evidence was not supplied; assembly identity observations are absent.",
        ]
        : []),
    ...(parsed.boundaries === null
        ? [
            "Managed native-boundary Evidence was not supplied; P/Invoke and native-implementation nodes are absent.",
        ]
        : []),
    ...(omissions.partialInput
        ? ["At least one supplied managed Evidence record has partial coverage."]
        : []),
];
