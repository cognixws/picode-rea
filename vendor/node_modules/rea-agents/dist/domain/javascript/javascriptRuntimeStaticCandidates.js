import { posix, relative, win32 } from "node:path";
import {} from "./javascriptApplicationGraph.js";
import { compareCodePoints, uniqueSorted } from "../canonicalOrdering.js";
/** Index statically reconstructed entities that can receive runtime matches. */
export const collectStaticRuntimeCandidates = (layers) => layers
    .flatMap((layer) => candidatesForLayer(layer))
    .sort((left, right) => compareCodePoints(left.layer.layerId, right.layer.layerId) ||
    compareCodePoints(left.node.node_id, right.node.node_id));
/** Translate one already-authorized runtime location into artifact paths. */
export const mappedRuntimePaths = (layer, entity) => {
    const paths = [];
    if (entity.location.kind === "file" && layer.result.format === "directory") {
        const path = pathBelowRoot(layer.result.input_path, entity.location.value);
        if (path !== null)
            paths.push({ path, basis: "artifact-path" });
    }
    for (const mapping of layer.runtimeMappings) {
        const suffix = mapping.kind === "file-root" && entity.location.kind === "file"
            ? pathBelowRoot(mapping.root, entity.location.value)
            : mapping.kind === "url-prefix" && entity.location.kind === "url"
                ? pathBelowUrlPrefix(mapping.prefix, entity.location.value)
                : null;
        if (suffix === null)
            continue;
        const path = safeArtifactPath(mapping.artifact_prefix, suffix);
        if (path === null)
            continue;
        paths.push({
            path,
            basis: mapping.kind === "file-root"
                ? "operator-file-mapping"
                : "operator-url-mapping",
        });
    }
    return uniqueMappedPaths(paths);
};
/** Precompute the artifact prefixes exercised by a bounded runtime set. */
export const createStaticRuntimeScope = (layer, entities) => ({
    artifactPrefixes: activeArtifactPrefixes(layer, entities),
    pathsByNodeId: indexStaticPaths(layer.graph),
});
/** Whether one static node falls under a mapping exercised by this runtime set. */
export const staticNodeWithinRuntimeScope = (node, scope) => (scope.pathsByNodeId.get(node.node_id) ?? []).some((path) => scope.artifactPrefixes.some((prefix) => pathWithinPrefix(path, prefix)));
const candidatesForLayer = (layer) => {
    const graph = layer.graph;
    const pathsByNodeId = indexStaticPaths(graph);
    return graph.nodes.flatMap((node) => {
        const category = candidateCategory(node);
        if (category === null)
            return [];
        return [
            {
                layer,
                node,
                category,
                paths: pathsByNodeId.get(node.node_id) ?? [],
                digests: candidateDigests(node),
            },
        ];
    });
};
const candidateCategory = (node) => {
    if (node.kind === "electron-renderer")
        return "renderer";
    if (node.kind === "javascript-asset" ||
        (node.kind === "javascript-module" && !isStaticSourceModule(node)))
        return "javascript";
    if (node.kind === "worker")
        return "worker";
    if (node.kind === "service-worker")
        return "service-worker";
    return null;
};
const isStaticSourceModule = (node) => node.observations.some(({ properties }) => properties.semantic_role === "source-module");
const indexStaticPaths = (graph) => {
    const nodes = new Map(graph.nodes.map((candidate) => [candidate.node_id, candidate]));
    const relatedBySource = new Map();
    for (const edge of graph.edges) {
        if (edge.relation !== "maps_to")
            continue;
        const target = nodes.get(edge.target_node_id);
        if (target === undefined)
            continue;
        const related = relatedBySource.get(edge.source_node_id);
        if (related === undefined)
            relatedBySource.set(edge.source_node_id, [target]);
        else
            related.push(target);
    }
    return new Map(graph.nodes.map((node) => [
        node.node_id,
        uniqueSorted([
            ...nodePaths(node),
            ...(relatedBySource.get(node.node_id) ?? []).flatMap(nodePaths),
        ]),
    ]));
};
const nodePaths = (node) => {
    const paths = [];
    if (node.identity.strategy === "canonical-path")
        paths.push(node.identity.path);
    for (const observation of node.observations) {
        for (const property of ["path", "resolved_path", "declared_path"])
            if (typeof observation.properties[property] === "string")
                paths.push(observation.properties[property]);
        if (observation.evidence.location.available &&
            observation.evidence.location.value.kind === "artifact-path")
            paths.push(observation.evidence.location.value.path);
    }
    return paths
        .map(normalizeArtifactPath)
        .filter((path) => path !== null && path !== "artifact-root");
};
const candidateDigests = (node) => {
    const values = [];
    if (node.kind === "javascript-asset" &&
        node.identity.strategy === "content-digest")
        values.push({
            sha256: node.identity.sha256,
            basis: "content-sha256",
        });
    if (node.kind === "javascript-module")
        for (const observation of node.observations) {
            const digest = observation.properties.source_sha256;
            if (typeof digest === "string" && /^[a-f0-9]{64}$/u.test(digest))
                values.push({ sha256: digest, basis: "module-source-sha256" });
        }
    return [
        ...new Map(values.map((value) => [`${value.basis}:${value.sha256}`, value])).values(),
    ];
};
const pathBelowRoot = (root, value) => {
    const rootStyle = absoluteFilePathStyle(root);
    if (rootStyle === null || rootStyle !== absoluteFilePathStyle(value))
        return null;
    const remainder = rootStyle === "windows"
        ? win32.relative(root, value)
        : relative(root, value);
    const portableRemainder = remainder.replaceAll("\\", "/");
    if (remainder === "" ||
        (rootStyle === "windows" && win32.isAbsolute(remainder)) ||
        portableRemainder === ".." ||
        portableRemainder.startsWith("../"))
        return null;
    return normalizeArtifactPath(portableRemainder);
};
const absoluteFilePathStyle = (path) => {
    if (/^[a-z]:[\\/]/iu.test(path) ||
        /^(?:\\\\|\/\/)[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/u.test(path))
        return "windows";
    return path.startsWith("/") ? "posix" : null;
};
const pathBelowUrlPrefix = (prefix, value) => {
    let base;
    let candidate;
    try {
        base = new URL(prefix);
        candidate = new URL(value);
    }
    catch (cause) {
        // Invalid input is represented by the null return.
        void cause;
        return null;
    }
    if (base.origin !== candidate.origin ||
        !candidate.pathname.startsWith(base.pathname))
        return null;
    try {
        return normalizeArtifactPath(decodeURIComponent(candidate.pathname.slice(base.pathname.length)));
    }
    catch (cause) {
        // Undecodable path segments are represented by the null return.
        void cause;
        return null;
    }
};
const activeArtifactPrefixes = (layer, entities) => {
    const prefixes = new Set();
    if (layer.result.format === "directory" &&
        entities.some(({ location }) => location.kind === "file" &&
            pathBelowRoot(layer.result.input_path, location.value) !== null))
        prefixes.add("");
    for (const mapping of layer.runtimeMappings)
        if (entities.some(({ location }) => mapping.kind === "file-root" && location.kind === "file"
            ? pathBelowRoot(mapping.root, location.value) !== null
            : mapping.kind === "url-prefix" && location.kind === "url"
                ? pathBelowUrlPrefix(mapping.prefix, location.value) !== null
                : false))
            prefixes.add(mapping.artifact_prefix);
    return [...prefixes].sort(compareCodePoints);
};
const pathWithinPrefix = (path, prefix) => prefix === "" || path === prefix || path.startsWith(`${prefix}/`);
const safeArtifactPath = (prefix, suffix) => normalizeArtifactPath(prefix === "" ? suffix : posix.join(prefix, suffix));
const normalizeArtifactPath = (value) => {
    const normalized = posix
        .normalize(value.replaceAll("\\", "/"))
        .replace(/^\.\//u, "");
    return normalized !== "" &&
        normalized !== "." &&
        normalized !== ".." &&
        !normalized.startsWith("/") &&
        !normalized.startsWith("../")
        ? normalized
        : null;
};
const uniqueMappedPaths = (values) => [
    ...new Map(values.map((value) => [`${value.basis}:${value.path}`, value])).values(),
].sort((left, right) => compareCodePoints(left.path, right.path) ||
    compareCodePoints(left.basis, right.basis));
