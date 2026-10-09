import { canonicalJson } from "./comparisonSemantics.js";
import { compareCodePoints } from "./canonicalOrdering.js";
export const identityProjection = (snapshot) => ({
    name: snapshot.procedure.name,
    signature: snapshot.procedure.signature,
    locals: snapshot.procedure.locals
        .map(({ description }) => description)
        .sort(),
});
export const functionMatch = (left, right) => {
    if (!isAutoName(left.procedure.name) &&
        left.procedure.name === right.procedure.name)
        return {
            status: "matched",
            method: "symbol",
            left_name: left.procedure.name,
            right_name: right.procedure.name,
        };
    return {
        status: left.procedure.name === right.procedure.name ? "ambiguous" : "mismatched",
        method: "explicit",
        left_name: left.procedure.name,
        right_name: right.procedure.name,
    };
};
export const normalizeCfg = (blocks) => {
    const parsed = [];
    for (const block of blocks) {
        const start = parseAddress(block.start);
        const end = parseAddress(block.end);
        if (start === null || end === null || end <= start)
            return null;
        parsed.push({ block, start, end });
    }
    const ordered = parsed.sort((left, right) => left.start < right.start ? -1 : left.start > right.start ? 1 : 0);
    if (new Set(ordered.map(({ start }) => start)).size !== ordered.length)
        return null;
    const indices = new Map(ordered.map(({ start }, index) => [start, index]));
    const graph = [];
    for (const { block, start, end } of ordered) {
        const successors = [];
        for (const address of block.successors) {
            const parsedAddress = parseAddress(address);
            if (parsedAddress === null)
                return null;
            const index = indices.get(parsedAddress);
            if (index === undefined)
                return null;
            successors.push(index);
        }
        graph.push({
            size: String(end - start),
            successors: successors.sort((left, right) => left - right),
        });
    }
    return graph;
};
export const referenceProjection = (snapshot) => sorted([
    ...snapshot.collections.incoming_references.items.map((item) => ({
        direction: "in",
        source: item.source_procedure?.name ?? null,
        target: item.target_procedure?.name ?? null,
    })),
    ...snapshot.collections.outgoing_references.items.map((item) => ({
        direction: "out",
        source: item.source_procedure?.name ?? null,
        target: item.target_procedure?.name ?? null,
    })),
]);
export const referenceKindProjection = (snapshot) => {
    const edges = [
        ...snapshot.collections.incoming_references.items.map((edge) => ({
            direction: "in",
            edge,
        })),
        ...snapshot.collections.outgoing_references.items.map((edge) => ({
            direction: "out",
            edge,
        })),
    ];
    if (edges.some(({ edge }) => !edge.kind.available))
        return null;
    return sorted(edges.map(({ direction, edge }) => {
        if (!edge.kind.available)
            throw new TypeError("Reference-kind availability changed during projection");
        return {
            direction,
            source: edge.source_procedure?.name ?? null,
            target: edge.target_procedure?.name ?? null,
            type: edge.kind.type,
            flow: edge.kind.flow,
            call: edge.kind.call,
            jump: edge.kind.jump,
            data: edge.kind.data,
            read: edge.kind.read,
            write: edge.kind.write,
            indirect: edge.kind.indirect,
            computed: edge.kind.computed,
            conditional: edge.kind.conditional,
            terminal: edge.kind.terminal,
            primary: edge.kind.primary,
            operand_index: edge.kind.operand_index,
            external: edge.kind.external,
        };
    }));
};
export const commentProjection = (snapshot) => {
    const values = snapshot.collections.comments.items.map(({ address, kind, text }) => ({
        offset: relativeAddress(address, snapshot.procedure.address),
        kind,
        text,
    }));
    return values.some(({ offset }) => offset === null) ? null : sorted(values);
};
export const stringAndNameProjection = (snapshot) => {
    const values = [
        ...snapshot.collections.referenced_strings.items.map(({ source_address: sourceAddress, value }) => ({
            kind: "string",
            source_offset: relativeAddress(sourceAddress, snapshot.procedure.address),
            value,
        })),
        ...snapshot.collections.referenced_names.items.map(({ source_address: sourceAddress, value }) => ({
            kind: "name",
            source_offset: relativeAddress(sourceAddress, snapshot.procedure.address),
            value,
        })),
    ];
    return values.some(({ source_offset: offset }) => offset === null)
        ? null
        : sorted(values);
};
export const sorted = (values) => values
    .map((value) => ({
    value,
    json: canonicalJson(value, "Function normalization"),
}))
    .sort((left, right) => {
    // Preserve existing collation while ordering distinct values within a tie.
    return (left.json.localeCompare(right.json) ||
        compareCodePoints(left.json, right.json));
})
    .map(({ value }) => value);
export const combineCoverage = (left, right) => {
    return {
        items: [...left.items, ...right.items],
        total: left.total + right.total,
        complete: true,
        truncated: false,
    };
};
export const project = (collection, mapper) => collection.items.map(mapper);
export const isAutoName = (name) => /^(?:sub_[0-9a-f]+|fcn\.[0-9a-f]+)$/iu.test(name);
const parseAddress = (value) => /^0x[0-9a-f]+$/iu.test(value) ? BigInt(value) : null;
const relativeAddress = (value, base) => {
    const parsed = parseAddress(value);
    const parsedBase = parseAddress(base);
    return parsed === null || parsedBase === null || parsed < parsedBase
        ? null
        : String(parsed - parsedBase);
};
