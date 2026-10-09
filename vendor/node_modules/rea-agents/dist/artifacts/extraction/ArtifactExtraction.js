import { lstat, realpath } from "node:fs/promises";
import { canonicalDigest } from "../../domain/comparisonSemantics.js";
import { AsarArtifactReader } from "../AsarArtifactReader.js";
import { ArtifactPathRegistry, normalizeArtifactPath, } from "../ArtifactPaths.js";
import { ArtifactReaderFailure, } from "../ArtifactReader.js";
import { DirectoryArtifactReader } from "../DirectoryArtifactReader.js";
import { SafeOutputTree } from "../SafeOutputTree.js";
import { ZipArtifactReader } from "../ZipArtifactReader.js";
import { MachOSliceArtifactReader } from "../MachOSliceArtifactReader.js";
import { artifactExtractionResultSchema, } from "../../domain/artifactGraph.js";
import { scanArtifactInventory } from "../inventory/ArtifactInventory.js";
/** Extract every regular inventory occurrence into an exclusively owned absent root. */
export const extractArtifact = async (input, signal) => {
    const sourcePath = await realpath(input.inputPath);
    const snapshot = await scanArtifactInventory(sourcePath, {
        signal,
    });
    const selectedOccurrences = snapshot.occurrences.filter((occurrence) => (occurrence.entry_kind === "file" || occurrence.entry_kind === "slice") &&
        occurrence.logical_path !== ".");
    const selectedIds = new Set(selectedOccurrences.map(({ occurrence_id: id }) => id));
    const occurrences = new Map();
    const neededNodes = new Set();
    collectOccurrences(snapshot.occurrences, selectedIds, occurrences, neededNodes);
    const nodes = new Map();
    collectNodes(snapshot.nodes, neededNodes, nodes);
    const inventory = {
        manifest: snapshot.manifest,
        occurrences,
        nodes,
    };
    const selected = selectedOccurrences.map((occurrence) => {
        if ((occurrence.entry_kind !== "file" && occurrence.entry_kind !== "slice") ||
            occurrence.artifact_id === null ||
            occurrence.encrypted ||
            occurrence.logical_path === ".")
            throw new ArtifactReaderFailure("format", `Selected occurrence is not an extractable regular child file: ${occurrence.occurrence_id}`);
        const node = inventory.nodes.get(occurrence.artifact_id);
        if (node === undefined)
            throw new ArtifactReaderFailure("integrity", `Selected occurrence has no inventory node: ${occurrence.occurrence_id}`);
        return { occurrence, node };
    });
    return materializeSelection({
        input,
        sourcePath,
        inventory,
        selected,
        signal,
    });
};
const materializeSelection = async ({ input, sourcePath, inventory, selected, signal, }) => {
    const byPath = new Map(selected.map((item) => [item.occurrence.logical_path, item]));
    const reader = await createReader(sourcePath, input.inputFormat);
    const output = await SafeOutputTree.create(input.outputRoot);
    let readerClosed = false;
    const extracted = [];
    try {
        const materialized = [];
        const registry = new ArtifactPathRegistry();
        for await (const entry of reader.entries(signal)) {
            const path = normalizeArtifactPath(entry.path);
            registry.add(path, entry.kind);
            const selectedItem = byPath.get(path);
            if (selectedItem === undefined) {
                if (entry.kind === "file" || entry.kind === "slice")
                    throw new ArtifactReaderFailure("integrity", `Regular artifact entry is missing from inventory: ${path}`);
                continue;
            }
            preflight(entry);
            const stream = await reader.open(entry, signal);
            const written = await output.write(path, stream, selectedItem.node.sha256, signal);
            extracted.push({
                artifact_id: selectedItem.node.artifact_id,
                relative_path: written.relativePath,
                sha256: written.sha256,
                bytes_written: written.bytesWritten,
                created: true,
            });
            materialized.push(selectedItem);
        }
        await reader.close();
        readerClosed = true;
        extracted.sort((left, right) => left.relative_path.localeCompare(right.relative_path, "en"));
        const result = createExtractionResult(input, inventory, materialized, extracted);
        await output.commit();
        return result;
    }
    catch (cause) {
        if (!readerClosed)
            await reader.close().catch((cause) => {
                // best-effort cleanup: reader close must not mask the extraction failure.
                void cause;
            });
        await output.rollback();
        throw cause;
    }
};
const createExtractionResult = (input, inventory, selected, extracted) => {
    const extractionSemantic = {
        source_manifest_id: inventory.manifest.manifest_id,
        selected_occurrence_ids: selected
            .map(({ occurrence }) => occurrence.occurrence_id)
            .sort((left, right) => left.localeCompare(right)),
        files_sha256: canonicalDigest(extracted, "Artifact"),
        output_root_alias: "$OUTPUT_ROOT",
    };
    return artifactExtractionResultSchema.parse({
        manifest: inventory.manifest,
        extraction_manifest: {
            ...extractionSemantic,
            extraction_id: `aex_${canonicalDigest(extractionSemantic, "Artifact")}`,
        },
        output_root: input.outputRoot,
        artifacts: extracted,
        containment_verified: true,
        cleanup: { attempted: false, verified: true, residual_paths: [] },
        provenance: [],
        limitations: [
            "All regular files in the active artifact were materialized; nested archive contents remain represented by their containing file.",
        ],
    });
};
const collectOccurrences = (items, selected, output, neededNodes) => {
    for (const item of items) {
        if (!selected.has(item.occurrence_id))
            continue;
        output.set(item.occurrence_id, item);
        if (item.artifact_id !== null)
            neededNodes.add(item.artifact_id);
    }
};
const collectNodes = (items, selected, output) => {
    for (const item of items)
        if (selected.has(item.artifact_id))
            output.set(item.artifact_id, item);
};
const createReader = async (path, format) => {
    if ((await lstat(path)).isDirectory())
        return new DirectoryArtifactReader(path);
    if (format === "asar")
        return new AsarArtifactReader(path);
    if (format === "ipa" ||
        format === "apk" ||
        format === "msix" ||
        format === "appx" ||
        format === "zip")
        return new ZipArtifactReader(path, format);
    if (format === "mach-o")
        return new MachOSliceArtifactReader(path);
    throw new ArtifactReaderFailure("unavailable", `Artifact format has no extraction reader: ${format}`);
};
const preflight = (entry) => {
    if ((entry.kind !== "file" && entry.kind !== "slice") || entry.encrypted)
        throw new ArtifactReaderFailure("format", `Selected artifact entry cannot be read: ${entry.path}`);
};
