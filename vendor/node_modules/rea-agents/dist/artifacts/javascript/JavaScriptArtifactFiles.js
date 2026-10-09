import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import { compareCodePoints } from "../../domain/canonicalOrdering.js";
import { AsarArtifactReader } from "../AsarArtifactReader.js";
import { ArtifactPathRegistry, normalizeArtifactPath, } from "../ArtifactPaths.js";
import { ArtifactReaderFailure, } from "../ArtifactReader.js";
import { streamChunkToBuffer } from "../StreamBytes.js";
import { hashReadable } from "../ArtifactHash.js";
/** Read all relevant textual entries through an already-inventoried reader. */
export const readJavaScriptArtifactFiles = async (reader, snapshot, signal) => {
    if (reader instanceof AsarArtifactReader) {
        const root = snapshot.nodes.find(({ artifact_id }) => artifact_id === snapshot.manifest.root_artifact_id);
        if (root === undefined)
            throw new ArtifactReaderFailure("integrity", "Root artifact node is missing");
        await verifyEntryBytes(reader.openContainer(signal), { path: ".", sha256: root.sha256, bytes: root.size }, signal);
    }
    const inventory = expectedInventory(snapshot);
    const expected = inventory.files;
    const context = {
        expected,
        expectedContainers: inventory.containers,
        registry: new ArtifactPathRegistry(),
        files: [],
        containers: [],
        signal,
        textBytes: 0,
        invalidUtf8: 0,
    };
    await visitReader(reader, "", snapshot.manifest.root_sha256, context);
    const files = context.files.sort((left, right) => compareCodePoints(left.path, right.path));
    assertExpectedFilesWereVisited(expected, files);
    return {
        files,
        containers: context.containers.sort((left, right) => compareCodePoints(left.path, right.path)),
        text_bytes_read: context.textBytes,
        invalid_utf8_files: context.invalidUtf8,
    };
};
const visitReader = async (reader, prefix, containerSha256, context) => {
    const stack = [
        {
            reader,
            prefix,
            containerSha256,
            iterator: reader.entries(context.signal)[Symbol.asyncIterator](),
            owned: false,
        },
    ];
    try {
        while (stack.length > 0) {
            const frame = stack.at(-1);
            if (frame === undefined)
                break;
            const next = await frame.iterator.next();
            if (next.done) {
                stack.pop();
                if (frame.owned)
                    await frame.reader.close();
                continue;
            }
            const entry = next.value;
            abortIfNeeded(context.signal);
            const path = normalizeArtifactPath(frame.prefix === "" ? entry.path : `${frame.prefix}/${entry.path}`);
            const nestedAsar = isFilesystemAsar(entry, path);
            context.registry.add(path, nestedAsar ? "directory" : entry.kind);
            if (nestedAsar) {
                const inventory = expectedContainer(path, context);
                await verifyEntryBytes(await frame.reader.open(entry, context.signal), inventory, context.signal);
                context.containers.push(inventory);
                const nested = new AsarArtifactReader(entry.adapterKey);
                stack.push({
                    reader: nested,
                    prefix: path,
                    containerSha256: inventory.sha256,
                    iterator: nested.entries(context.signal)[Symbol.asyncIterator](),
                    owned: true,
                });
                continue;
            }
            const expected = context.expected.get(path);
            if (expected === undefined)
                continue;
            const text = await readText(context, {
                reader: frame.reader,
                entry,
                expected,
            });
            context.files.push({
                path,
                container_sha256: frame.containerSha256,
                sha256: expected.sha256,
                bytes: expected.bytes,
                inventory_artifact_id: expected.inventoryArtifactId,
                kind: expected.kind,
                unpacked: entry.unpacked,
                text,
            });
        }
    }
    finally {
        await Promise.allSettled(stack
            .filter(({ owned }) => owned)
            .map(async ({ reader, iterator }) => {
            await iterator.return?.();
            await reader.close();
        }));
    }
};
const expectedContainer = (path, context) => {
    const container = context.expectedContainers.get(path);
    if (container === undefined)
        throw new ArtifactReaderFailure("integrity", `Nested ASAR disappeared from inventory: ${path}`);
    return container;
};
const readText = async (context, input) => {
    if (input.expected.kind === "native-addon") {
        await verifyEntryBytes(await input.reader.open(input.entry, context.signal), input.expected, context.signal);
        return { included: false, reason: "not-applicable" };
    }
    const bytes = await readAll(await input.reader.open(input.entry, context.signal), context.signal);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== input.expected.sha256 || bytes.length !== input.expected.bytes)
        throw new ArtifactReaderFailure("integrity", `Artifact entry changed after inventory: ${input.expected.path}`);
    context.textBytes += bytes.length;
    try {
        return {
            included: true,
            value: new TextDecoder("utf-8", {
                fatal: true,
                ignoreBOM: input.expected.kind === "javascript" ||
                    input.expected.kind === "html",
            }).decode(bytes),
        };
    }
    catch (cause) {
        // Non-UTF8 bytes are counted; the fixed reason preserves the schema.
        void cause;
        context.invalidUtf8 += 1;
        return { included: false, reason: "invalid-utf8" };
    }
};
const verifyEntryBytes = async (stream, expected, signal) => {
    try {
        const digest = await hashReadable(stream, signal);
        if (digest.sha256 !== expected.sha256 || digest.bytes !== expected.bytes)
            throw new ArtifactReaderFailure("integrity", `Artifact entry changed after inventory: ${expected.path}`);
    }
    catch (cause) {
        abortIfNeeded(signal);
        throw cause;
    }
};
const expectedInventory = (snapshot) => {
    const nodes = new Map(snapshot.nodes.map((node) => [node.artifact_id, node]));
    const files = new Map();
    const containers = new Map();
    for (const occurrence of snapshot.occurrences) {
        if (occurrence.artifact_id === null || occurrence.logical_path === ".")
            continue;
        const node = nodes.get(occurrence.artifact_id);
        if (node === undefined)
            throw new ArtifactReaderFailure("integrity", `Artifact inventory node is missing: ${occurrence.logical_path}`);
        // Inventory occurrences can have content identities for directories too.
        // Suffixes only describe file candidates; a directory such as
        // node_modules/@zip.js remains a graph node and must never be opened.
        if (occurrence.entry_kind !== "file")
            continue;
        if (occurrence.logical_path.toLowerCase().endsWith(".asar"))
            containers.set(occurrence.logical_path, {
                path: occurrence.logical_path,
                sha256: node.sha256,
                bytes: node.size,
                inventory_artifact_id: node.artifact_id,
            });
        const kind = relevantKind(occurrence.logical_path);
        if (kind === undefined)
            continue;
        files.set(occurrence.logical_path, {
            path: occurrence.logical_path,
            sha256: node.sha256,
            bytes: node.size,
            inventoryArtifactId: node.artifact_id,
            kind,
        });
    }
    return { files, containers };
};
const readAll = async (stream, signal) => {
    const chunks = [];
    let bytes = 0;
    for await (const raw of stream) {
        abortIfNeeded(signal);
        const chunk = streamChunkToBuffer(raw);
        bytes += chunk.length;
        chunks.push(chunk);
    }
    return Buffer.concat(chunks, bytes);
};
const assertExpectedFilesWereVisited = (expected, actual) => {
    const observed = new Set(actual.map(({ path }) => path));
    for (const path of expected.keys())
        if (!observed.has(path))
            throw new ArtifactReaderFailure("integrity", `Relevant artifact entry disappeared after inventory: ${path}`);
};
const relevantKind = (path) => {
    const lower = path.toLowerCase();
    if (lower === "package.json" || lower.endsWith("/package.json"))
        return "package-json";
    if (lower.endsWith(".json"))
        return "json";
    if (/\.(?:cjs|cts|mjs|mts|js|jsx|ts|tsx)$/u.test(lower))
        return "javascript";
    if (/\.html?$/u.test(lower))
        return "html";
    if (lower.endsWith(".map"))
        return "source-map";
    if (lower.endsWith(".node"))
        return "native-addon";
    return undefined;
};
const isFilesystemAsar = (entry, path) => entry.kind === "file" &&
    path.toLowerCase().endsWith(".asar") &&
    isAbsolute(entry.adapterKey);
const abortIfNeeded = (signal) => {
    if (signal?.aborted === true)
        throw new ArtifactReaderFailure("cancelled", "JavaScript artifact reconstruction cancelled");
};
