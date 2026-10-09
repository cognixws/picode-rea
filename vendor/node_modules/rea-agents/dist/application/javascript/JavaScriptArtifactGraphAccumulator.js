import { createJavaScriptApplicationEdge, createJavaScriptApplicationNode, } from "../../domain/javascript/javascriptApplicationGraph.js";
/** Deduplicate graph entities while retaining distinct evidence observations. */
export class JavaScriptArtifactGraphAccumulator {
    #nodes = new Map();
    #edges = new Map();
    /** Create or merge one canonical node. */
    addNode(input) {
        const created = createJavaScriptApplicationNode(displayableNode(input));
        const existing = this.#nodes.get(created.node_id);
        if (existing === undefined) {
            this.#nodes.set(created.node_id, created);
            return created;
        }
        const bySemanticId = new Map([...existing.observations, ...created.observations].map((observation) => [
            observation.observation_id,
            observationInput(observation),
        ]));
        const observations = [...bySemanticId.entries()]
            .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
            .map(([, observation]) => observation);
        const merged = createJavaScriptApplicationNode({
            kind: existing.kind,
            identity: existing.identity,
            observations,
        });
        this.#nodes.set(merged.node_id, merged);
        return merged;
    }
    /** Create or replace one canonical edge by semantic identifier. */
    addEdge(input) {
        const edge = createJavaScriptApplicationEdge(input);
        this.#edges.set(edge.edge_id, edge);
        return edge;
    }
    /** Return all accumulated canonical nodes. */
    nodes() {
        return [...this.#nodes.values()];
    }
    /** Return all accumulated canonical edges. */
    edges() {
        return [...this.#edges.values()];
    }
}
const observationInput = (observation) => {
    const { observation_id: _observationId, identifier_strategy: _strategy, ...input } = observation;
    return input;
};
/**
 * Static findings can carry legal empty strings, such as `fetch("")`,
 * `require("")`, or a source map's `sources: [""]`. Labels must be nonempty,
 * so an empty value has no label rather than synthetic text that a real value
 * could share; literal feature seeds match labels. Identities and observation
 * properties keep the exact value.
 */
const displayableNode = (input) => ({
    ...input,
    observations: input.observations.map((observation) => ({
        ...observation,
        label: observation.label === "" ? null : observation.label,
    })),
});
