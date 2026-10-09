import { createHash } from "node:crypto";
import canonicalize from "canonicalize";
import { compareCodePoints, uniqueSorted } from "../canonicalOrdering.js";
/** Canonical JSON used by semantic query commitments and ordering. */
export const canonicalJavaScriptSemanticQueryJson = (value) => {
    const encoded = canonicalize(value);
    if (encoded === undefined)
        throw new TypeError("JavaScript semantic query could not canonicalize data");
    return encoded;
};
const digest = (value) => createHash("sha256")
    .update(canonicalJavaScriptSemanticQueryJson(value))
    .digest("hex");
/** Derive the stable identity for one graph-bound query. */
export const javaScriptSemanticQueryIdentifier = (graph, input) => {
    const semantic = input;
    return `jsrq_${digest({
        source_graph_id: graph.graph_id,
        ...semantic,
        allowed_relations: semantic.allowed_relations === undefined
            ? undefined
            : uniqueSorted(semantic.allowed_relations),
        expected: semantic.expected === null
            ? null
            : {
                ...semantic.expected,
                classes: uniqueSorted(semantic.expected.classes),
            },
    })}`;
};
/** Resolve deterministic seed candidates without applying traversal limits. */
export const resolveJavaScriptSemanticQuerySeeds = (graph, input) => {
    const fingerprintFunctions = new Set(input.seed.kind === "function"
        ? graph.fingerprints
            .filter(({ fingerprint_sha256 }) => input.seed.kind === "function" &&
            fingerprint_sha256 === input.seed.fingerprint_sha256)
            .map(({ function_node_id }) => function_node_id)
        : []);
    return graph.nodes
        .filter((node) => seedMatches(node, input, fingerprintFunctions))
        .map(({ node_id }) => node_id)
        .sort(compareCodePoints);
};
const seedMatches = (node, input, fingerprintFunctions) => {
    const seed = input.seed;
    if (seed.kind === "semantic-node")
        return node.node_id === seed.node_id;
    if (seed.kind === "application-node")
        return node.application_node_ids.includes(seed.node_id);
    if (seed.kind === "function")
        return fingerprintFunctions.has(node.node_id);
    if (seed.kind === "literal")
        return (node.kind === "literal" &&
            canonicalJavaScriptSemanticQueryJson(node.properties.value) ===
                canonicalJavaScriptSemanticQueryJson(seed.value));
    if (seed.kind === "property")
        return node.kind === "property-slot" && node.properties.name === seed.name;
    if (seed.kind === "endpoint")
        return node.kind === "request" && node.properties.endpoint === seed.value;
    if (seed.kind === "event")
        return (["event", "listener"].includes(node.kind) &&
            node.properties.event_name === seed.name);
    return node.kind === "boundary" && node.properties.field === seed.field;
};
