import {} from "./javascriptApplicationGraph.js";
import { compareCodePoints } from "../canonicalOrdering.js";
/** Traverse a JAG without treating edge inference as observed reachability. */
export const traverseApplicationFeature = (graph, seedNodeIds, direction) => {
    const nodeById = new Map(graph.nodes.map((node) => [node.node_id, node]));
    const adjacency = buildAdjacency(graph.edges, direction);
    const visited = new Set(seedNodeIds);
    const retainedEdges = new Map();
    const predecessors = new Map();
    const queue = [...seedNodeIds];
    for (let offset = 0; offset < queue.length; offset += 1) {
        const current = queue[offset];
        if (current === undefined)
            continue;
        for (const entry of adjacency.get(current) ?? []) {
            retainedEdges.set(entry.edge.edge_id, entry.edge);
            if (visited.has(entry.nextNodeId))
                continue;
            if (!nodeById.has(entry.nextNodeId))
                continue;
            visited.add(entry.nextNodeId);
            predecessors.set(entry.nextNodeId, {
                previousNodeId: current,
                edgeId: entry.edge.edge_id,
            });
            queue.push(entry.nextNodeId);
        }
    }
    return {
        nodes: [...visited]
            .map((nodeId) => nodeById.get(nodeId))
            .filter((node) => node !== undefined)
            .sort((left, right) => compareCodePoints(left.node_id, right.node_id)),
        edges: [...retainedEdges.values()].sort((left, right) => compareCodePoints(left.edge_id, right.edge_id)),
        predecessors,
    };
};
const buildAdjacency = (edges, direction) => {
    const adjacency = new Map();
    for (const edge of edges) {
        if (direction !== "incoming")
            addAdjacency(adjacency, edge.source_node_id, {
                edge,
                nextNodeId: edge.target_node_id,
            });
        if (direction !== "outgoing")
            addAdjacency(adjacency, edge.target_node_id, {
                edge,
                nextNodeId: edge.source_node_id,
            });
    }
    for (const entries of adjacency.values())
        entries.sort((left, right) => compareCodePoints(`${left.edge.edge_id}\0${left.nextNodeId}`, `${right.edge.edge_id}\0${right.nextNodeId}`));
    return adjacency;
};
const addAdjacency = (adjacency, nodeId, entry) => {
    const entries = adjacency.get(nodeId);
    if (entries === undefined)
        adjacency.set(nodeId, [entry]);
    else
        entries.push(entry);
};
