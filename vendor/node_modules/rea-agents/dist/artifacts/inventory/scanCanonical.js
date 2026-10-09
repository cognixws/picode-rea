import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { ArtifactReaderFailure, } from "../ArtifactReader.js";
import { artifactInventoryResultSchema, } from "../../domain/artifactGraph.js";
import { createArtifactEdges, createRootNode, indexOccurrencesByPath, materializeDirectoryNodes, rekeyOccurrences, rootOccurrenceFor, } from "./ArtifactGraphConstruction.js";
import { artifactContradictionId, artifactGraphDigest, artifactManifestId, } from "../../domain/artifactIdentity.js";
import { classifyRoot } from "./classify.js";
import { hashReadable } from "../ArtifactHash.js";
import { createReader, inventoryLimitations } from "./reader.js";
import { scanReader, } from "./scanReader.js";
import { STRICT_INTEGRITY_POLICY, } from "./types.js";
export const scanCanonicalArtifactInventory = async (path, options = {}) => {
    const integrity = options.integrity ?? STRICT_INTEGRITY_POLICY;
    const metadata = await lstat(path);
    const rootFormat = await classifyRoot(path, metadata.isDirectory());
    const rootDigest = metadata.isDirectory()
        ? null
        : await hashReadable(createReadStream(path), options.signal);
    const reader = await createReader(path, rootFormat, options.signal);
    try {
        const { nodes, occurrences, pendingContradictions } = await scanReader(reader, options.signal, integrity);
        return await buildInventorySnapshot({
            path,
            metadata,
            rootFormat,
            rootDigest,
            reader,
            signal: options.signal,
            nodes,
            occurrences,
            pendingContradictions,
        });
    }
    finally {
        await reader?.close();
    }
};
const buildInventorySnapshot = async (input) => {
    const { path, metadata, rootFormat, rootDigest, reader, signal } = input;
    materializeDirectoryNodes(input.occurrences, input.nodes);
    const rootNode = createRootNode({
        path,
        format: rootFormat,
        directory: metadata.isDirectory(),
        digest: rootDigest,
        occurrences: input.occurrences,
    });
    input.nodes.set(rootNode.artifact_id, rootNode);
    rekeyOccurrences(rootNode.artifact_id, input.occurrences);
    const rootOccurrence = rootOccurrenceFor(rootNode, metadata.size);
    for (const occurrence of input.occurrences)
        if (occurrence.parent_occurrence_id === null)
            occurrence.parent_occurrence_id = rootOccurrence.occurrence_id;
    input.occurrences.unshift(rootOccurrence);
    const occurrenceById = new Map(input.occurrences.map((occurrence) => [
        occurrence.occurrence_id,
        occurrence,
    ]));
    const occurrenceByPath = indexOccurrencesByPath(input.occurrences);
    const integrityContradictions = buildIntegrityContradictions(input.pendingContradictions, occurrenceByPath, occurrenceById, rootNode);
    const edges = createArtifactEdges(rootNode.artifact_id, input.occurrences, reader?.provenance()[0]);
    const orderedNodes = sortNodes([...input.nodes.values()]);
    const orderedOccurrences = sortOccurrences(input.occurrences);
    const orderedEdges = sortEdges(edges);
    await verifyRootDigest(path, rootDigest, signal);
    const graphSha256 = artifactGraphDigest({
        nodes: orderedNodes,
        occurrences: orderedOccurrences,
        edges: orderedEdges,
        contradictions: integrityContradictions,
    });
    const manifest = buildManifest({
        rootNode,
        graphSha256,
        orderedNodes,
        orderedOccurrences,
        orderedEdges,
    });
    return {
        manifest,
        nodes: orderedNodes,
        occurrences: orderedOccurrences,
        edges: orderedEdges,
        provenance: reader?.provenance() ?? [],
        integrity_contradictions: integrityContradictions,
        limitations: buildLimitations(rootFormat, reader, integrityContradictions),
    };
};
const buildIntegrityContradictions = (pending, occurrenceByPath, occurrenceById, rootNode) => pending.map((contradiction) => {
    const occurrence = occurrenceByPath.get(contradiction.logicalPath);
    if (occurrence === undefined)
        throw new ArtifactReaderFailure("integrity", "Integrity contradiction lost its graph occurrence");
    const parent = occurrence.parent_occurrence_id === null
        ? undefined
        : occurrenceById.get(occurrence.parent_occurrence_id);
    const parentArtifactId = parent?.artifact_id ?? rootNode.artifact_id;
    return {
        contradiction_id: artifactContradictionId({
            rootArtifactId: rootNode.artifact_id,
            logicalPath: contradiction.logicalPath,
            declaredSha256: contradiction.declaredSha256,
            observedSha256: contradiction.observedSha256,
        }),
        occurrence_id: occurrence.occurrence_id,
        parent_artifact_id: parentArtifactId,
        logical_path: contradiction.logicalPath,
        declared_sha256: contradiction.declaredSha256,
        observed_sha256: contradiction.observedSha256,
        entry_kind: contradiction.entryKind,
        unpacked: contradiction.unpacked,
        trust: "observed-untrusted",
        provenance: "container-integrity-metadata-versus-observed-bytes",
        limitations: [
            "Observed bytes contradict declared integrity metadata and cannot support equivalence.",
        ],
    };
});
const verifyRootDigest = async (path, rootDigest, signal) => {
    if (rootDigest === null)
        return;
    const verified = await hashReadable(createReadStream(path), signal);
    if (verified.sha256 !== rootDigest.sha256 ||
        verified.bytes !== rootDigest.bytes)
        throw new ArtifactReaderFailure("integrity", "Root artifact changed during inventory");
};
const sortNodes = (nodes) => nodes.sort((left, right) => left.artifact_id.localeCompare(right.artifact_id));
const sortOccurrences = (occurrences) => occurrences.sort((left, right) => left.logical_path.localeCompare(right.logical_path, "en"));
const sortEdges = (edges) => edges.sort((left, right) => left.edge_id.localeCompare(right.edge_id));
const buildManifest = ({ rootNode, graphSha256, orderedNodes, orderedOccurrences, orderedEdges, }) => artifactInventoryResultSchema.shape.manifest.parse({
    manifest_id: artifactManifestId(rootNode.artifact_id, graphSha256),
    root_artifact_id: rootNode.artifact_id,
    root_sha256: rootNode.sha256,
    root_format: rootNode.format,
    graph_sha256: graphSha256,
    node_count: orderedNodes.length,
    occurrence_count: orderedOccurrences.length,
    edge_count: orderedEdges.length,
});
const buildLimitations = (rootFormat, reader, integrityContradictions) => [
    ...inventoryLimitations(rootFormat, reader),
    ...(integrityContradictions.length === 0
        ? []
        : [
            `${String(integrityContradictions.length)} integrity contradiction(s) were recorded; mismatched content is observed-untrusted.`,
        ]),
];
