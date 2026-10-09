import { absenceClaimable, canonicalDigest, canonicalJson, } from "../comparisonSemantics.js";
import { compareCodePoints } from "../canonicalOrdering.js";
import {} from "./javascriptApplicationGraph.js";
/** Classify matched, unmatched, and ambiguous nodes without inventing absence. */
export const classifyJavaScriptApplicationVersions = (matching, context) => {
    const pairByLeft = new Map(matching.pairs.map(({ left, right }) => [
        left.node_id,
        `pair:${left.node_id}:${right.node_id}`,
    ]));
    const pairByRight = new Map(matching.pairs.map(({ left, right }) => [
        right.node_id,
        `pair:${left.node_id}:${right.node_id}`,
    ]));
    const fullContext = { ...context, pairByLeft, pairByRight };
    const leftItems = matching.unmatchedLeft.map((node) => {
        const candidates = matching.candidatesForLeft.get(node.node_id) ?? [];
        return unmatchedItem({
            left: node,
            candidateRightNodeIds: candidates,
        }, fullContext);
    });
    const rightItems = matching.unmatchedRight.map((node) => {
        const candidates = matching.candidatesForRight.get(node.node_id) ?? [];
        return unmatchedItem({
            right: node,
            candidateLeftNodeIds: candidates,
        }, fullContext);
    });
    return {
        items: [
            ...matching.pairs.map((pair) => matchedItem(pair, fullContext)),
            ...leftItems,
            ...rightItems,
        ].sort((left, right) => compareCodePoints(left.item_id, right.item_id)),
    };
};
const matchedItem = (pair, context) => {
    const dimensions = changedDimensions(pair, context);
    const complete = graphsComplete(context);
    const observedChange = dimensions.some((dimension) => ["content", "location", "properties"].includes(dimension));
    const status = observedChange || (complete && dimensions.length > 0)
        ? "changed"
        : complete
            ? "unchanged"
            : "unknown";
    const finalDimensions = status === "unknown" && !dimensions.includes("coverage")
        ? [...dimensions, "coverage"]
        : dimensions;
    const semantic = {
        status,
        node_kind: pair.left.kind,
        left_node_id: pair.left.node_id,
        right_node_id: pair.right.node_id,
        match: matchedMatch(pair),
        dimensions: finalDimensions,
        evidence_links: itemEvidenceLinks(pair.left, pair.right, context),
        limitations: pairLimitations(pair, status),
    };
    return itemWithId(semantic);
};
const unmatchedItem = (member, context) => member.left === undefined
    ? rightOnlyItem(member.right, member.candidateLeftNodeIds, context)
    : leftOnlyItem(member.left, member.candidateRightNodeIds, context);
const leftOnlyItem = (node, candidateNodeIds, context) => {
    const [firstCandidate, ...remainingCandidates] = candidateNodeIds;
    const common = {
        node_kind: node.kind,
        evidence_links: itemEvidenceLinks(node, undefined, context),
    };
    if (firstCandidate !== undefined)
        return itemWithId({
            ...common,
            status: "unknown",
            left_node_id: node.node_id,
            right_node_id: null,
            match: {
                status: "ambiguous",
                basis: "none",
                confidence: "unknown",
                candidate_left_node_ids: [],
                candidate_right_node_ids: [firstCandidate, ...remainingCandidates],
            },
            dimensions: ["availability"],
            limitations: [AMBIGUOUS_MATCH_LIMITATION],
        });
    const absenceObserved = absenceClaimable(context.rightGraph.coverage);
    return itemWithId({
        ...common,
        status: absenceObserved ? "removed" : "unknown",
        left_node_id: node.node_id,
        right_node_id: null,
        match: unmatchedMatch(),
        dimensions: absenceObserved
            ? ["availability"]
            : ["availability", "coverage"],
        limitations: absenceObserved ? [] : [INCOMPLETE_GRAPH_LIMITATION],
    });
};
const rightOnlyItem = (node, candidateNodeIds, context) => {
    const [firstCandidate, ...remainingCandidates] = candidateNodeIds;
    const common = {
        node_kind: node.kind,
        evidence_links: itemEvidenceLinks(undefined, node, context),
    };
    if (firstCandidate !== undefined)
        return itemWithId({
            ...common,
            status: "unknown",
            left_node_id: null,
            right_node_id: node.node_id,
            match: {
                status: "ambiguous",
                basis: "none",
                confidence: "unknown",
                candidate_left_node_ids: [firstCandidate, ...remainingCandidates],
                candidate_right_node_ids: [],
            },
            dimensions: ["availability"],
            limitations: [AMBIGUOUS_MATCH_LIMITATION],
        });
    const absenceObserved = absenceClaimable(context.leftGraph.coverage);
    return itemWithId({
        ...common,
        status: absenceObserved ? "added" : "unknown",
        left_node_id: null,
        right_node_id: node.node_id,
        match: unmatchedMatch(),
        dimensions: absenceObserved
            ? ["availability"]
            : ["availability", "coverage"],
        limitations: absenceObserved ? [] : [INCOMPLETE_GRAPH_LIMITATION],
    });
};
const matchedMatch = (pair) => {
    const candidates = {
        candidate_left_node_ids: [],
        candidate_right_node_ids: [],
    };
    switch (pair.basis) {
        case "exact-node-identity":
        case "exact-content-digest":
        case "exact-module-source-digest":
            return {
                status: "matched",
                basis: pair.basis,
                confidence: "exact",
                ...candidates,
            };
        case "source-map-identity":
            return {
                status: "matched",
                basis: pair.basis,
                confidence: "high",
                ...candidates,
            };
        case "structural-fingerprint":
        case "semantic-key":
            return {
                status: "matched",
                basis: pair.basis,
                confidence: "medium",
                ...candidates,
            };
    }
};
const unmatchedMatch = () => ({
    status: "unmatched",
    basis: "none",
    confidence: "unknown",
    candidate_left_node_ids: [],
    candidate_right_node_ids: [],
});
const AMBIGUOUS_MATCH_LIMITATION = "Multiple nodes share the same permitted match key; no cross-version pair was selected.";
const INCOMPLETE_GRAPH_LIMITATION = "The opposite graph is incomplete, so an unmatched node cannot be classified as added or removed.";
const changedDimensions = (pair, context) => {
    const dimensions = [];
    const leftContent = contentIdentity(pair.left);
    const rightContent = contentIdentity(pair.right);
    if (leftContent !== null &&
        rightContent !== null &&
        leftContent !== rightContent)
        dimensions.push("content");
    if (canonicalJson(locations(pair.left)) !== canonicalJson(locations(pair.right)))
        dimensions.push("location");
    if (canonicalJson(properties(pair.left)) !==
        canonicalJson(properties(pair.right)))
        dimensions.push("properties");
    if (relationshipSignature(pair.left, "left", context) !==
        relationshipSignature(pair.right, "right", context))
        dimensions.push("relationships");
    return dimensions;
};
const contentIdentity = (node) => {
    if (node.identity.strategy === "content-digest")
        return `content:${node.identity.sha256}`;
    if (node.kind === "javascript-module")
        return stringProperty(node, "source_sha256");
    if (node.kind === "source-module" &&
        node.identity.strategy === "source-map-original")
        return node.identity.source_sha256;
    return null;
};
const locations = (node) => node.observations
    .map(({ evidence }) => evidence.location.available ? evidence.location.value : evidence.location)
    .sort((left, right) => compareCodePoints(canonicalJson(left), canonicalJson(right)));
const properties = (node) => node.observations
    .map(({ label, properties: values }) => ({ label, properties: values }))
    .sort((left, right) => compareCodePoints(canonicalJson(left), canonicalJson(right)));
const relationshipSignature = (node, side, context) => {
    const graph = side === "left" ? context.leftGraph : context.rightGraph;
    const paired = side === "left" ? context.pairByLeft : context.pairByRight;
    const nodeById = new Map(graph.nodes.map((value) => [value.node_id, value]));
    const signatures = graph.edges.flatMap((edge) => {
        if (edge.source_node_id === node.node_id)
            return [
                edgeSignature({
                    direction: "out",
                    relation: edge.relation,
                    neighborId: edge.target_node_id,
                    paired,
                    nodeById,
                }),
            ];
        if (edge.target_node_id === node.node_id)
            return [
                edgeSignature({
                    direction: "in",
                    relation: edge.relation,
                    neighborId: edge.source_node_id,
                    paired,
                    nodeById,
                }),
            ];
        return [];
    });
    return canonicalJson(signatures.sort(compareCodePoints));
};
const edgeSignature = (context) => {
    const mapped = context.paired.get(context.neighborId);
    const neighbor = context.nodeById.get(context.neighborId);
    return `${context.direction}\0${context.relation}\0${mapped ?? `unmatched:${neighbor?.kind ?? "unknown"}`}`;
};
const itemEvidenceLinks = (left, right, context) => [
    ...new Set([
        context.leftEvidenceId,
        context.rightEvidenceId,
        ...nativeLinks(left, context.leftNativeEvidence),
        ...nativeLinks(right, context.rightNativeEvidence),
    ]),
].sort(compareCodePoints);
const nativeLinks = (node, evidence) => {
    const digest = node === undefined
        ? null
        : contentIdentity(node)?.replace(/^content:/u, "");
    return digest === null
        ? []
        : evidence
            .filter(({ subject }) => subject?.digest.sha256 === digest)
            .map(({ evidence_id: id }) => id);
};
const pairLimitations = (pair, status) => [
    ...(pair.basis === "structural-fingerprint"
        ? [
            "Structural fingerprint equality is rename-resistant inference; it is not byte identity or proof of semantic equivalence.",
        ]
        : []),
    ...(pair.basis === "source-map-identity"
        ? [
            "Source-map original names identify a candidate source lineage; changed or unavailable source content remains explicit.",
        ]
        : []),
    ...(pair.basis === "semantic-key"
        ? [
            "Semantic-key pairing is a deterministic inference and is never promoted to exact identity.",
        ]
        : []),
    ...(status === "unknown"
        ? ["Incomplete graph coverage prevents a complete node-level conclusion."]
        : []),
];
const itemWithId = (semantic) => ({
    ...semantic,
    item_id: `javc_item_${canonicalDigest(semantic, "Application version item")}`,
});
const stringProperty = (node, key) => {
    const values = [
        ...new Set(node.observations
            .map(({ properties: values }) => values[key])
            .filter((value) => typeof value === "string")),
    ];
    return values.length === 1 ? (values[0] ?? null) : null;
};
const graphsComplete = (context) => absenceClaimable(context.leftGraph.coverage) &&
    absenceClaimable(context.rightGraph.coverage);
