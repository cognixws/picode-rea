import { artifactInventoryResultSchema, } from "./artifactGraph.js";
import { canonicalJson } from "./comparisonSemantics.js";
import { artifactContradictionId, artifactEdgeId, artifactGraphDigest, artifactIdForContent, artifactManifestId, occurrenceIdForLocation, } from "./artifactIdentity.js";
import { parseEvidence } from "./evidence.js";
import { artifactInspectionResultSchema } from "./artifactInspection.js";
import { err, ok } from "./result.js";
/** Parse, merge, and verify inventory Evidence pages. */
export const parseArtifactInventoryEvidence = (input) => assembleInventorySet((Array.isArray(input) ? input : [input]).map((value) => {
    const evidence = parseEvidence(value);
    const inventoryEvidence = evidence.operation === "inventory_artifact"
        ? evidence
        : evidence.operation === "inspect_artifact"
            ? artifactInspectionResultSchema.parse(evidence.normalized_result)
                .substeps[0]?.evidence
            : undefined;
    if (inventoryEvidence === undefined)
        throw new TypeError("Artifact comparison requires inspect_artifact Evidence");
    const inventory = artifactInventoryResultSchema.parse(inventoryEvidence.normalized_result);
    if (inventoryEvidence.subject === null ||
        inventoryEvidence.subject.digest.sha256 !==
            inventory.manifest.root_sha256 ||
        inventoryEvidence.subject.format !== inventory.manifest.root_format)
        throw new TypeError("Artifact inventory Evidence subject does not match its root digest");
    validateInventoryPage(inventory);
    return { evidence, inventory };
}));
const validateInventoryPage = (inventory) => {
    assertUnique(inventory.nodes.map(({ artifact_id: id }) => id), "node ID");
    assertUnique(inventory.occurrences.map(({ occurrence_id: id }) => id), "occurrence ID");
    assertUnique(inventory.occurrences.map(({ logical_path: path }) => path), "logical path");
    assertUnique(inventory.edges.map(({ edge_id: id }) => id), "edge ID");
    for (const node of inventory.nodes)
        if (node.artifact_id !== artifactIdForContent(node.sha256))
            throw new TypeError("Artifact node ID is not content-addressed");
};
/**
 * Result-returning seam for the empty-pages leaf. Other assembly failures
 * still throw TypeError (migration in progress); parseArtifactInventoryEvidence
 * keeps its throwing contract until callers switch.
 */
export const tryAssembleInventorySet = (pages) => pages.length === 0
    ? err({
        code: "empty",
        message: "Artifact inventory requires Evidence pages",
    })
    : ok(assembleInventorySet(pages));
const assembleInventorySet = (pages) => {
    const first = pages[0];
    if (first === undefined)
        throw new TypeError("Artifact inventory requires Evidence pages");
    const manifestJson = canonicalJson(first.inventory.manifest, "Artifact inventory");
    const nodes = new Map();
    const occurrences = new Map();
    const paths = new Map();
    const edges = new Map();
    for (const page of pages) {
        if (canonicalJson(page.inventory.manifest, "Artifact inventory") !==
            manifestJson)
            throw new TypeError("Artifact inventory pages do not share one manifest");
        if (canonicalJson(page.inventory.integrity_contradictions, "Artifact inventory") !==
            canonicalJson(first.inventory.integrity_contradictions, "Artifact inventory"))
            throw new TypeError("Artifact inventory pages do not share integrity contradictions");
        for (const node of page.inventory.nodes)
            mergeExact(nodes, node.artifact_id, node, "node");
        for (const occurrence of page.inventory.occurrences) {
            mergeExact(occurrences, occurrence.occurrence_id, occurrence, "occurrence");
            mergeExact(paths, occurrence.logical_path, occurrence, "logical path");
        }
        for (const edge of page.inventory.edges)
            mergeExact(edges, edge.edge_id, edge, "edge");
    }
    const inventory = orderedInventory(first.inventory, pages, {
        nodes,
        occurrences,
        edges,
    });
    if (inventory.complete)
        validateCompleteInventory(inventory);
    return { evidence: pages.map(({ evidence }) => evidence), inventory };
};
const orderedInventory = (first, pages, values) => {
    const nodes = [...values.nodes.values()].sort((left, right) => left.artifact_id.localeCompare(right.artifact_id));
    const occurrences = [...values.occurrences.values()].sort((left, right) => left.logical_path.localeCompare(right.logical_path, "en"));
    const edges = [...values.edges.values()].sort((left, right) => left.edge_id.localeCompare(right.edge_id));
    return {
        manifest: first.manifest,
        nodes,
        occurrences,
        edges,
        integrityContradictions: first.integrity_contradictions,
        limitations: [
            ...new Set(pages.flatMap(({ inventory }) => inventory.limitations)),
        ].sort((left, right) => left.localeCompare(right)),
        complete: nodes.length === first.manifest.node_count &&
            occurrences.length === first.manifest.occurrence_count &&
            edges.length === first.manifest.edge_count,
    };
};
const validateCompleteInventory = (inventory) => {
    const nodeIds = new Set(inventory.nodes.map(({ artifact_id: id }) => id));
    const occurrenceIds = new Set(inventory.occurrences.map(({ occurrence_id: id }) => id));
    const rootNode = inventory.nodes.find(({ artifact_id: id }) => id === inventory.manifest.root_artifact_id);
    if (rootNode?.sha256 !== inventory.manifest.root_sha256)
        throw new TypeError("Artifact root node does not match its manifest digest");
    for (const occurrence of inventory.occurrences)
        validateOccurrence(occurrence, inventory, nodeIds, occurrenceIds);
    for (const edge of inventory.edges)
        validateEdge(edge, nodeIds, occurrenceIds);
    for (const contradiction of inventory.integrityContradictions) {
        if (!nodeIds.has(contradiction.parent_artifact_id) ||
            !occurrenceIds.has(contradiction.occurrence_id))
            throw new TypeError("Integrity contradiction references a missing graph member");
        const expectedId = artifactContradictionId({
            rootArtifactId: inventory.manifest.root_artifact_id,
            logicalPath: contradiction.logical_path,
            declaredSha256: contradiction.declared_sha256,
            observedSha256: contradiction.observed_sha256,
        });
        if (contradiction.contradiction_id !== expectedId)
            throw new TypeError("Integrity contradiction ID does not match its identity");
    }
    const graphSha256 = artifactGraphDigest({
        nodes: inventory.nodes,
        occurrences: inventory.occurrences,
        edges: inventory.edges,
        contradictions: inventory.integrityContradictions,
    });
    if (graphSha256 !== inventory.manifest.graph_sha256)
        throw new TypeError("Artifact graph commitment does not match its members");
    const manifestId = artifactManifestId(inventory.manifest.root_artifact_id, graphSha256);
    if (manifestId !== inventory.manifest.manifest_id)
        throw new TypeError("Artifact manifest ID does not match its commitment");
};
const validateOccurrence = (occurrence, inventory, nodeIds, occurrenceIds) => {
    if (occurrence.artifact_id !== null && !nodeIds.has(occurrence.artifact_id))
        throw new TypeError("Artifact occurrence references a missing node");
    if (occurrence.parent_occurrence_id !== null &&
        !occurrenceIds.has(occurrence.parent_occurrence_id))
        throw new TypeError("Artifact occurrence references a missing parent");
    const expectedId = occurrenceIdForLocation({
        rootArtifactId: inventory.manifest.root_artifact_id,
        logicalPath: occurrence.logical_path,
        entryKind: occurrence.entry_kind,
    });
    if (occurrence.occurrence_id !== expectedId)
        throw new TypeError("Artifact occurrence ID does not match its identity");
};
const validateEdge = (edge, nodeIds, occurrenceIds) => {
    if (!nodeIds.has(edge.parent_artifact_id) ||
        !nodeIds.has(edge.child_artifact_id) ||
        !occurrenceIds.has(edge.occurrence_id))
        throw new TypeError("Artifact edge references a missing graph member");
    const semantic = {
        parent_artifact_id: edge.parent_artifact_id,
        child_artifact_id: edge.child_artifact_id,
        relation: edge.relation,
        occurrence_id: edge.occurrence_id,
        logical_path: edge.logical_path,
    };
    if (edge.edge_id !== artifactEdgeId(semantic))
        throw new TypeError("Artifact edge ID does not match its identity");
};
const mergeExact = (output, key, value, label) => {
    const previous = output.get(key);
    if (previous !== undefined &&
        canonicalJson(previous, "Artifact inventory") !==
            canonicalJson(value, "Artifact inventory"))
        throw new TypeError(`Artifact inventory has conflicting ${label} pages`);
    output.set(key, value);
};
const assertUnique = (values, label) => {
    if (new Set(values).size !== values.length)
        throw new TypeError(`Artifact inventory contains a duplicate ${label}`);
};
