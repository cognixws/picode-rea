import { compareCodePoints } from "../../domain/canonicalOrdering.js";
import { JAVASCRIPT_SEMANTIC_RELATION_FAMILIES } from "../../domain/javascript/javascriptSemanticGraphSchemas.js";
/** Index one immutable file IR; read retained callable membership at query time. */
export const createSemanticCallableOwnerLookup = (ir, nodes) => {
    const entries = ir.callables
        .map((callable, order) => ({
        callableId: callable.callableId,
        range: callable.location,
        order,
        priority: positionKey(callable.location),
    }))
        .sort((left, right) => pointCompare(left.range.start, right.range.start) ||
        left.order - right.order);
    const tree = buildSourceIntervalTree(entries, 0, entries.length);
    return (location) => {
        if (location === null || tree === null || nodes.size === 0)
            return undefined;
        const pending = [tree];
        let best;
        let result;
        while (pending.length > 0) {
            const current = pending.pop();
            if (current === undefined ||
                pointCompare(current.minimumStart, location.start) > 0 ||
                pointCompare(current.maximumEnd, location.end) < 0)
                continue;
            const candidate = current.entry;
            if (contains(candidate.range, location)) {
                const node = nodes.get(candidate.callableId);
                const rank = best === undefined
                    ? 1
                    : compareCodePoints(candidate.priority, best.priority) ||
                        best.order - candidate.order;
                if (node !== undefined && rank > 0) {
                    best = candidate;
                    result = node;
                }
            }
            if (current.left !== null)
                pending.push(current.left);
            if (current.right !== null)
                pending.push(current.right);
        }
        return result;
    };
};
const buildSourceIntervalTree = (entries, start, end) => {
    if (start >= end)
        return null;
    const middle = Math.floor((start + end) / 2);
    const entry = entries[middle];
    if (entry === undefined)
        return null;
    // This recursion follows a balanced index, not the producer's nesting depth.
    const left = buildSourceIntervalTree(entries, start, middle);
    const right = buildSourceIntervalTree(entries, middle + 1, end);
    let minimumEnd = entry.range.end;
    let maximumEnd = entry.range.end;
    for (const child of [left, right]) {
        if (child !== null && pointCompare(child.minimumEnd, minimumEnd) < 0)
            minimumEnd = child.minimumEnd;
        if (child !== null && pointCompare(child.maximumEnd, maximumEnd) > 0)
            maximumEnd = child.maximumEnd;
    }
    return {
        entry,
        minimumStart: left?.minimumStart ?? entry.range.start,
        maximumStart: right?.maximumStart ?? entry.range.start,
        minimumEnd,
        maximumEnd,
        left,
        right,
    };
};
/** Index an immutable node list; return contained ranges in producer order. */
export const createSemanticNodeRangeLookup = (nodes) => {
    const entries = nodes
        .flatMap((node, order) => {
        const range = node.identity.source_range;
        return range === null ? [] : [{ node, range, order }];
    })
        .sort((left, right) => pointCompare(left.range.start, right.range.start) ||
        left.order - right.order);
    const tree = buildSourceIntervalTree(entries, 0, entries.length);
    return (range) => {
        if (tree === null)
            return [];
        const pending = [tree];
        const matches = [];
        while (pending.length > 0) {
            const current = pending.pop();
            if (current === undefined ||
                pointCompare(current.maximumStart, range.start) < 0 ||
                pointCompare(current.minimumEnd, range.end) > 0)
                continue;
            if (contains(range, current.entry.range))
                matches.push(current.entry);
            if (current.left !== null)
                pending.push(current.left);
            if (current.right !== null)
                pending.push(current.right);
        }
        return matches
            .sort((left, right) => left.order - right.order)
            .map(({ node }) => node);
    };
};
/** Index exact call ranges, preserving the first producer occurrence. */
export const createSemanticCallSiteLookup = (ir, nodes) => {
    const identifiers = new Map();
    for (const call of ir.callSites) {
        const key = rangeKey(call.location);
        if (!identifiers.has(key))
            identifiers.set(key, call.callSiteId);
    }
    return (range) => {
        const identifier = identifiers.get(rangeKey(range));
        return identifier === undefined ? undefined : nodes.get(identifier);
    };
};
const rangeKey = (range) => `${range.start.line}:${range.start.column}-${range.end.line}:${range.end.column}`;
/** Report extractor support without treating missing families as absence. */
export const semanticFamilyStatus = (family, analysis) => {
    if (![
        "call-flow",
        "boundary",
        "child-process",
        "closure",
        "configuration",
        "data-flow",
        "event",
        "object-flow",
        "promise-ownership",
        "request",
        "resource-lifecycle",
        "timer",
    ].includes(family))
        return "unsupported";
    return analysis.truncated_scopes === 0 ? "partial" : "unknown";
};
const contains = (outer, inner) => pointCompare(outer.start, inner.start) <= 0 &&
    pointCompare(outer.end, inner.end) >= 0;
const pointCompare = (left, right) => left.line - right.line || left.column - right.column;
const positionKey = (range) => `${String(range.start.line).padStart(12, "0")}:${String(range.start.column).padStart(12, "0")}`;
