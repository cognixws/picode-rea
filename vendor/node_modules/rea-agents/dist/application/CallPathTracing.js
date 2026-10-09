import { projectAnalysisError } from "../domain/analysisErrorProjection.js";
import {} from "../domain/analysisErrorBase.js";
import { parseRelatedAddresses } from "../domain/hopperValues.js";
import { ok } from "../domain/result.js";
import { resolveProcedureAddress } from "./ProcedureAddressResolution.js";
/** Trace direct caller/callee relationships until the graph is exhausted or the goal is reached. */
export const traceCallPath = async (call, input, signal) => {
    const start = await resolveProcedureAddress(call, input.start, signal);
    if (!start.ok)
        return start;
    let goal;
    if (input.goal !== undefined) {
        const resolved = await resolveProcedureAddress(call, input.goal, signal);
        if (!resolved.ok)
            return resolved;
        goal = resolved.value;
    }
    const resolvedInput = {
        start: start.value,
        ...(goal === undefined ? {} : { goal }),
        direction: input.direction,
    };
    const state = createTraceState(resolvedInput);
    while (state.queueIndex < state.queue.length &&
        state.traversalPath.length === 0) {
        const address = state.queue[state.queueIndex++];
        if (address === undefined)
            break;
        const current = state.visited.get(address);
        if (current === undefined)
            continue;
        const found = await expandAddress(call, {
            input: resolvedInput,
            state,
            address,
            current,
            ...(signal === undefined ? {} : { signal }),
        });
        if (found)
            break;
    }
    return ok(projectTrace(resolvedInput, state));
};
const createTraceState = (input) => ({
    visited: new Map([[input.start, { depth: 0, path: [input.start] }]]),
    queue: [input.start],
    edges: new Map(),
    failures: [],
    residual: new Set(),
    queueIndex: 0,
    traversalPath: input.goal === input.start ? [input.start] : [],
});
const expandAddress = async (call, expansion) => {
    const { input, state, address, current, signal } = expansion;
    const relation = input.direction === "forward" ? "callees" : "callers";
    const tool = input.direction === "forward" ? "procedure_callees" : "procedure_callers";
    const result = await call(tool, { procedure: address }, signal);
    if (!result.ok) {
        state.failures.push({
            address,
            error: projectAnalysisError(result.error),
        });
        state.residual.add(`Call relationships were unavailable for ${address}.`);
        return false;
    }
    const related = parseRelatedAddresses(result.value, relation);
    if (!related.ok) {
        state.failures.push({
            address,
            error: projectAnalysisError(related.error),
        });
        state.residual.add(`Call relationships were unreadable for ${address}.`);
        return false;
    }
    for (const relatedAddress of sortedUniqueAddresses(related.value)) {
        recordEdge(input, state, {
            address,
            relatedAddress,
            discoveryDepth: current.depth + 1,
        });
        const path = state.visited.get(relatedAddress)?.path ?? [
            ...current.path,
            relatedAddress,
        ];
        if (state.visited.has(relatedAddress)) {
            if (relatedAddress === input.goal) {
                state.traversalPath = path;
                return true;
            }
            continue;
        }
        state.visited.set(relatedAddress, {
            depth: current.depth + 1,
            path,
        });
        if (relatedAddress === input.goal) {
            state.traversalPath = path;
            return true;
        }
        state.queue.push(relatedAddress);
    }
    return false;
};
const recordEdge = (input, state, edge) => {
    const sourceAddress = input.direction === "forward" ? edge.address : edge.relatedAddress;
    const targetAddress = input.direction === "forward" ? edge.relatedAddress : edge.address;
    const edgeKey = `${sourceAddress}\u0000${targetAddress}`;
    if (state.edges.has(edgeKey))
        return;
    state.edges.set(edgeKey, {
        source_address: sourceAddress,
        target_address: targetAddress,
        discovery_depth: edge.discoveryDepth,
    });
};
const projectTrace = (input, state) => ({
    start: input.start,
    goal: input.goal ?? null,
    direction: input.direction,
    goal_status: input.goal === undefined
        ? "not_requested"
        : state.traversalPath.length > 0
            ? "reached"
            : "not_reached",
    nodes: [...state.visited.entries()]
        .map(([address, { depth }]) => ({ address, depth }))
        .sort((left, right) => left.depth - right.depth || compareAddress(left.address, right.address)),
    edges: [...state.edges.values()].sort((left, right) => left.discovery_depth - right.discovery_depth ||
        compareAddress(left.source_address, right.source_address) ||
        compareAddress(left.target_address, right.target_address)),
    traversal_path: state.traversalPath,
    failures: state.failures,
    traversal: {
        nodes_visited: state.visited.size,
    },
    truncated: state.residual.size > 0,
    residual_unknowns: [...state.residual],
    limitations: [
        "Direct provider call relationships may omit unresolved indirect calls.",
    ],
});
const compareAddress = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const sortedUniqueAddresses = (addresses) => [...new Set(addresses)].sort(compareAddress);
