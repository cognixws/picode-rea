import { compareCodePoints } from "../canonicalOrdering.js";
const matchTiers = () => [
    {
        match: { basis: "exact-content-digest", confidence: "exact" },
        key: contentDigestKey,
    },
    {
        match: { basis: "exact-module-source-digest", confidence: "exact" },
        key: moduleSourceDigestKey,
    },
    {
        match: { basis: "exact-node-identity", confidence: "exact" },
        key: nodeIdentityKey,
    },
    {
        match: { basis: "source-map-identity", confidence: "high" },
        key: sourceMapKey,
    },
    {
        match: { basis: "structural-fingerprint", confidence: "medium" },
        key: structuralFingerprintKey,
    },
    {
        match: { basis: "semantic-key", confidence: "medium" },
        key: semanticKey,
    },
];
/** Apply ordered, unique-only matching tiers without fuzzy pairing. */
export const matchJavaScriptApplicationVersions = (leftNodes, rightNodes) => {
    const left = new Map(leftNodes.map((node) => [node.node_id, node]));
    const right = new Map(rightNodes.map((node) => [node.node_id, node]));
    const leftCandidates = new Map();
    const rightCandidates = new Map();
    const pairs = [];
    for (const tier of matchTiers())
        applyTier({ left, right, pairs, leftCandidates, rightCandidates, tier });
    const remainingLeft = sortedNodes(left.values());
    const remainingRight = sortedNodes(right.values());
    const leftIds = new Set(remainingLeft.map(({ node_id: id }) => id));
    const rightIds = new Set(remainingRight.map(({ node_id: id }) => id));
    return {
        pairs: pairs.sort((a, b) => compareCodePoints(`${a.left.node_id}\0${a.right.node_id}`, `${b.left.node_id}\0${b.right.node_id}`)),
        unmatchedLeft: remainingLeft,
        unmatchedRight: remainingRight,
        candidatesForLeft: filteredCandidates(leftCandidates, rightIds),
        candidatesForRight: filteredCandidates(rightCandidates, leftIds),
    };
};
const applyTier = (context) => {
    const leftByKey = nodesByKey(context.left.values(), context.tier.key);
    const rightByKey = nodesByKey(context.right.values(), context.tier.key);
    for (const key of [...leftByKey.keys()].sort(compareCodePoints)) {
        const leftGroup = leftByKey.get(key) ?? [];
        const rightGroup = rightByKey.get(key) ?? [];
        if (rightGroup.length === 0)
            continue;
        recordCandidates(leftGroup, rightGroup, context.leftCandidates, context.rightCandidates);
        if (leftGroup.length !== 1 || rightGroup.length !== 1)
            continue;
        const leftNode = leftGroup[0];
        const rightNode = rightGroup[0];
        if (leftNode === undefined || rightNode === undefined)
            continue;
        context.pairs.push({
            left: leftNode,
            right: rightNode,
            ...context.tier.match,
        });
        context.left.delete(leftNode.node_id);
        context.right.delete(rightNode.node_id);
    }
};
const nodesByKey = (nodes, keyFor) => {
    const output = new Map();
    for (const node of nodes) {
        const key = keyFor(node);
        if (key === null)
            continue;
        output.set(key, [...(output.get(key) ?? []), node]);
    }
    return output;
};
const recordCandidates = (left, right, leftCandidates, rightCandidates) => {
    for (const leftNode of left) {
        const candidates = leftCandidates.get(leftNode.node_id) ?? new Set();
        for (const rightNode of right)
            candidates.add(rightNode.node_id);
        leftCandidates.set(leftNode.node_id, candidates);
    }
    for (const rightNode of right) {
        const candidates = rightCandidates.get(rightNode.node_id) ?? new Set();
        for (const leftNode of left)
            candidates.add(leftNode.node_id);
        rightCandidates.set(rightNode.node_id, candidates);
    }
};
const filteredCandidates = (candidates, retained) => new Map([...candidates.entries()].flatMap(([nodeId, values]) => {
    const filtered = [...values]
        .filter((value) => retained.has(value))
        .sort(compareCodePoints);
    return filtered.length === 0 ? [] : [[nodeId, filtered]];
}));
const nodeIdentityKey = (node) => `node\0${node.kind}\0${node.node_id}`;
const contentDigestKey = (node) => node.identity.strategy === "content-digest"
    ? `content\0${node.kind}\0${node.identity.sha256}`
    : null;
const moduleSourceDigestKey = (node) => {
    if (node.kind !== "javascript-module")
        return null;
    const value = uniqueStringProperty(node, "source_sha256");
    return value === null ? null : `module-source\0${node.kind}\0${value}`;
};
const sourceMapKey = (node) => node.kind === "source-module" &&
    node.identity.strategy === "source-map-original"
    ? `source-map\0${node.identity.original_source}`
    : null;
const structuralFingerprintKey = (node) => {
    if (node.kind !== "javascript-module")
        return null;
    const digest = uniqueStringProperty(node, "structural_fingerprint_sha256");
    const algorithm = uniqueStringProperty(node, "structural_fingerprint_algorithm");
    return digest === null || algorithm === null
        ? null
        : `structural\0${node.kind}\0${algorithm}\0${digest}`;
};
const semanticKey = (node) => {
    if ([
        "javascript-module",
        "javascript-chunk",
        "runtime-script-instance",
        "unknown",
    ].includes(node.kind))
        return null;
    const properties = firstProperties(node);
    const value = semanticValue(node, properties);
    return value === null ? null : `semantic\0${node.kind}\0${value}`;
};
const semanticValue = (node, properties) => {
    if (node.kind === "endpoint") {
        const kind = nonEmptyString(properties.endpoint_kind);
        const value = exactString(properties.value);
        return kind === null || value === null ? null : `${kind}\0${value}`;
    }
    if (node.kind === "storage")
        return joined(properties.storage_kind, properties.name ?? properties.mechanism);
    if (node.kind === "ipc-channel")
        return properties.resolution === "dynamic"
            ? null
            : (exactString(properties.channel) ?? firstLabel(node));
    if (node.kind === "context-bridge-api")
        return (firstLabel(node) ??
            exactString(properties.api_key) ??
            nonEmptyString(properties.api_name));
    if (node.kind === "native-export")
        return (joined(properties.specifier, stringList(properties.requested_members).join(",")) ?? firstLabel(node));
    if ([
        "electron-main",
        "electron-preload",
        "electron-renderer",
        "electron-utility",
    ].includes(node.kind))
        return joined(properties.declared_path, properties.resolved_path);
    if (node.kind === "package")
        return nonEmptyString(properties.name);
    return canonicalPath(node) ?? nonEmptyString(properties.path);
};
const canonicalPath = (node) => node.identity.strategy === "canonical-path" ? node.identity.path : null;
const firstProperties = (node) => node.observations[0]?.properties ?? {};
const firstLabel = (node) => node.observations.find(({ label }) => label !== null)?.label ?? null;
const uniqueStringProperty = (node, name) => {
    const values = [
        ...new Set(node.observations
            .map(({ properties }) => properties[name])
            .filter((value) => typeof value === "string")),
    ];
    return values.length === 1 ? (values[0] ?? null) : null;
};
const joined = (...values) => {
    const strings = values.map(nonEmptyString);
    return strings.some((value) => value === null) ? null : strings.join("\0");
};
const nonEmptyString = (value) => typeof value === "string" && value !== "" ? value : null;
/** A literal value such as `ipcMain.handle("")` keeps its exact empty text. */
const exactString = (value) => typeof value === "string" ? value : null;
const stringList = (value) => Array.isArray(value)
    ? value
        .filter((item) => typeof item === "string")
        .sort(compareCodePoints)
    : [];
const sortedNodes = (nodes) => [...nodes].sort((left, right) => compareCodePoints(left.node_id, right.node_id));
