import { compareCodePoints } from "../canonicalOrdering.js";
import { isJavaScriptSemanticOwnershipRelation as ownershipRelation } from "./javascriptSemanticQueryRelations.js";
import { javaScriptSemanticQueryInputSchema, javaScriptSemanticQueryResultSchema, } from "./javascriptSemanticQuerySchemas.js";
import { assessJavaScriptSemanticQuery } from "./javascriptSemanticQueryAssessment.js";
import { javaScriptSemanticQueryIdentifier as queryIdentifier, resolveJavaScriptSemanticQuerySeeds as resolveSeeds, } from "./javascriptSemanticQueryIdentity.js";
/** Run one deterministic traversal over a verified semantic graph. */
export const queryJavaScriptSemanticGraph = (graph, rawInput) => {
    const input = javaScriptSemanticQueryInputSchema.parse(rawInput);
    const queryId = queryIdentifier(graph, input);
    const seeds = resolveSeeds(graph, input);
    const admission = admitSeeds(graph, seeds);
    const retainedSeeds = admission.nodeIds;
    const adjacency = buildAdjacency(graph.relations, input);
    const traversal = traverse(graph, retainedSeeds, adjacency);
    const result = createQueryResult(graph, traversal);
    const allRelevantUnknowns = relevantUnknownFrontiers(graph, traversal.nodeIds, input);
    const relevantUnknowns = allRelevantUnknowns;
    const candidateRelations = relevantCandidateRelationCount(graph, traversal.nodeIds, input);
    const expectedMatches = expectedMatchesFor(result.retainedNodes, result.retainedRelations, input);
    const assessment = assessJavaScriptSemanticQuery({
        graph,
        totalSeeds: seeds.length,
        expectedMatches: expectedMatches.length,
        hasExpectation: input.expected !== null,
        unknowns: relevantUnknowns,
        candidateRelations,
    });
    return javaScriptSemanticQueryResultSchema.parse({
        query_id: queryId,
        source_graph_id: graph.graph_id,
        seed: input.seed,
        direction: input.direction,
        status: assessment.status,
        seed_node_ids: retainedSeeds,
        nodes: result.retainedNodes,
        relations: result.retainedRelations,
        unknowns: relevantUnknowns,
        expected_match_node_ids: expectedMatches.map(({ node_id }) => node_id),
        summary: {
            total_seed_matches: seeds.length,
            traversed_nodes: traversal.nodeIds.size,
            traversed_relations: traversal.relationIds.size,
            traversed_functions: traversal.functionIds.size,
            traversed_modules: traversal.modules.size,
            relevant_unknowns: allRelevantUnknowns.length,
        },
        coverage: assessment.coverage,
        limitations: assessment.limitations,
    });
};
const createQueryResult = (graph, traversal) => {
    const retainedNodes = graph.nodes.filter(({ node_id }) => traversal.nodeIds.has(node_id));
    const retainedRelations = graph.relations.filter(({ relation_id }) => traversal.relationIds.has(relation_id));
    return { retainedNodes, retainedRelations };
};
const admitSeeds = (graph, seeds) => {
    const nodes = new Map(graph.nodes.map((node) => [node.node_id, node]));
    const retained = [];
    for (const nodeId of seeds) {
        const node = nodes.get(nodeId);
        if (node === undefined)
            continue;
        retained.push(nodeId);
    }
    return { nodeIds: retained };
};
const buildAdjacency = (relations, input) => {
    const adjacency = new Map();
    const allowed = input.allowed_relations === undefined
        ? null
        : new Set(input.allowed_relations);
    for (const relation of relations) {
        if (allowed !== null && !allowed.has(relation.relation))
            continue;
        if (relation.resolution === "candidate" &&
            !input.include_ambiguous_dynamic_edges)
            continue;
        addDirectedEntries(adjacency, relation, input.direction);
    }
    for (const entries of adjacency.values())
        entries.sort((left, right) => compareCodePoints(`${left.relation.relation_id}\0${left.nextNodeId}`, `${right.relation.relation_id}\0${right.nextNodeId}`));
    return adjacency;
};
const addDirectedEntries = (adjacency, relation, direction) => {
    if (direction === "callers") {
        if (relation.relation === "calls")
            addEntry(adjacency, relation.target_node_id, relation.source_node_id, relation);
        return;
    }
    if (direction === "ownership") {
        if (!ownershipRelation(relation.relation))
            return;
        addEntry(adjacency, relation.source_node_id, relation.target_node_id, relation);
        addEntry(adjacency, relation.target_node_id, relation.source_node_id, relation);
        return;
    }
    if (direction === "backward-provenance")
        addEntry(adjacency, relation.target_node_id, relation.source_node_id, relation);
    else
        addEntry(adjacency, relation.source_node_id, relation.target_node_id, relation);
};
const addEntry = (adjacency, from, nextNodeId, relation) => {
    const entries = adjacency.get(from) ?? [];
    entries.push({ relation, nextNodeId });
    adjacency.set(from, entries);
};
const traverse = (graph, seeds, adjacency) => {
    const nodes = new Map(graph.nodes.map((node) => [node.node_id, node]));
    const nodeIds = new Set(seeds);
    const relationIds = new Set();
    const functionIds = new Set();
    const modules = new Set();
    const queue = [...nodeIds];
    for (const nodeId of nodeIds)
        retainOwners(nodes.get(nodeId), functionIds, modules);
    for (let offset = 0; offset < queue.length; offset += 1) {
        const current = queue[offset];
        if (current === undefined)
            continue;
        for (const entry of adjacency.get(current) ?? []) {
            relationIds.add(entry.relation.relation_id);
            if (nodeIds.has(entry.nextNodeId))
                continue;
            const node = nodes.get(entry.nextNodeId);
            if (node === undefined)
                continue;
            nodeIds.add(entry.nextNodeId);
            retainOwners(node, functionIds, modules);
            queue.push(entry.nextNodeId);
        }
    }
    return {
        nodeIds,
        relationIds,
        functionIds,
        modules,
    };
};
const retainOwners = (node, functions, modules) => {
    if (node === undefined)
        return;
    const functionId = node.kind === "function" ? node.node_id : node.function_node_id;
    if (functionId !== null)
        functions.add(functionId);
    modules.add(node.identity.module_path);
};
const relevantUnknownFrontiers = (graph, nodeIds, input) => {
    const allowed = input.allowed_relations === undefined
        ? null
        : new Set(input.allowed_relations);
    return graph.unknowns.filter((unknown) => (unknown.node_id === null || nodeIds.has(unknown.node_id)) &&
        (allowed === null ||
            unknown.relation_kinds.some((relation) => allowed.has(relation))));
};
const relevantCandidateRelationCount = (graph, nodeIds, input) => {
    const adjacency = buildAdjacency(graph.relations.filter(({ resolution }) => resolution === "candidate"), { ...input, include_ambiguous_dynamic_edges: true });
    const relevant = new Set();
    for (const nodeId of nodeIds)
        for (const { relation } of adjacency.get(nodeId) ?? [])
            relevant.add(relation.relation_id);
    return relevant.size;
};
const expectedMatchesFor = (nodes, relations, input) => {
    if (input.expected === null)
        return [];
    const classes = new Set(input.expected.classes);
    const connected = new Set(relations.map((relation) => input.expected?.role === "source"
        ? relation.target_node_id
        : relation.source_node_id));
    return nodes.filter(({ kind, node_id }) => classes.has(kind) && !connected.has(node_id));
};
