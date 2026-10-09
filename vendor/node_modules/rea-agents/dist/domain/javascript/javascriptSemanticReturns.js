import * as t from "@babel/types";
import { compareCodePoints } from "../canonicalOrdering.js";
import { semanticCallableIdForNode } from "./javascriptSemanticProjection.js";
import { resolveSemanticBindingState, } from "./javascriptSemanticState.js";
import { evaluateSemanticExpression } from "./javascriptSemanticValues.js";
import { range } from "./javascriptStaticAnalysisHelpers.js";
import { semanticReturnCoverage } from "./javascriptSemanticCoverage.js";
import { traverseJavaScriptAst } from "./javascriptSemanticTraversal.js";
/** Evaluate direct returns while excluding every nested callable. */
export const collectSemanticReturns = (program, state, parserPartial) => {
    const nodes = callableNodes(program);
    return state.callables.map((callable) => {
        const node = nodes.get(callable.callableId);
        if (node === undefined)
            return {
                ...callable,
                returnCoverage: {
                    status: "partial",
                    retainedCount: 0,
                    omittedCount: null,
                },
            };
        const expressions = directReturnExpressions(node);
        const sites = [];
        for (const expression of expressions) {
            sites.push({
                returnSiteId: semanticReturnSiteId(callable.callableId, expression.location),
                location: expression.location,
                identityReferenceLocation: expression.node !== null && t.isIdentifier(expression.node)
                    ? range(expression.node)
                    : null,
                value: expression.node === null
                    ? { status: "unknown", reason: "Return has no value." }
                    : evaluateSemanticExpression(expression.node, state),
            });
        }
        return {
            ...callable,
            returnSites: sites,
            returnCoverage: semanticReturnCoverage(sites.length, parserPartial),
        };
    });
};
const semanticReturnSiteId = (callableId, location) => `${callableId}:return:${String(location.start.line)}:${String(location.start.column)}:${String(location.end.line)}:${String(location.end.column)}`;
/** Link exports to callables only when lexical resolution is unique and exact. */
export const resolveSemanticModuleCallables = (state, callables) => {
    const callableIds = new Set(callables.map(({ callableId }) => callableId));
    const root = state.scopes.find(({ kind }) => kind === "program");
    return state.moduleLinks.map((link) => {
        if (link.callableId !== null && callableIds.has(link.callableId))
            return link;
        if (link.localName === null || root === undefined)
            return { ...link, callableId: null };
        const named = callables.filter(({ name, containerScopeId }) => name === link.localName && containerScopeId === root.scopeId);
        if (named.length === 1)
            return { ...link, callableId: named[0]?.callableId ?? null };
        const binding = root.bindings.get(link.localName);
        const resolved = binding === undefined
            ? []
            : callableIdsForBinding(binding, state, callableIds, new Set());
        return {
            ...link,
            callableId: resolved.length === 1 ? (resolved[0] ?? null) : null,
        };
    });
};
const callableNodes = (program) => {
    const output = new Map();
    traverseJavaScriptAst(program, {
        enter: (node) => {
            const id = semanticCallableIdForNode(node);
            if (id !== null)
                output.set(id, node);
        },
    });
    return output;
};
const directReturnExpressions = (callable) => {
    if (t.isArrowFunctionExpression(callable) &&
        !t.isBlockStatement(callable.body))
        return [{ node: callable.body, location: range(callable.body) }];
    if (!t.isFunction(callable))
        return [];
    const output = [];
    const visit = (node) => {
        if (t.isFunction(node) || t.isClass(node))
            return;
        if (t.isReturnStatement(node)) {
            output.push({ node: node.argument ?? null, location: range(node) });
            return;
        }
        for (const child of childNodes(node))
            visit(child);
    };
    for (const child of childNodes(callable.body))
        visit(child);
    return output;
};
const childNodes = (node) => (t.VISITOR_KEYS[node.type] ?? []).flatMap((key) => {
    const value = Reflect.get(node, key);
    if (t.isNode(value))
        return [value];
    return Array.isArray(value)
        ? value.filter((item) => t.isNode(item))
        : [];
});
const callableIdsForBinding = (binding, state, admitted, seen) => {
    if (seen.has(binding.bindingId) || binding.initializers.length !== 1)
        return [];
    const initializer = binding.initializers[0];
    if (initializer === undefined || initializer.projection.length > 0)
        return [];
    return callableIdsForNode(initializer.node, state, admitted, new Set([...seen, binding.bindingId]));
};
const callableIdsForNode = (node, state, admitted, seen) => {
    const direct = semanticCallableIdForNode(node);
    if (direct !== null && admitted.has(direct))
        return [direct];
    if (t.isIdentifier(node)) {
        const binding = resolveSemanticBindingState(state, node, node.name);
        return binding === undefined
            ? []
            : callableIdsForBinding(binding, state, admitted, seen);
    }
    if (t.isTSAsExpression(node) ||
        t.isTSTypeAssertion(node) ||
        t.isTSNonNullExpression(node))
        return callableIdsForNode(node.expression, state, admitted, seen);
    return [];
};
/** Flatten a semantic value to bounded JSON-pointer leaves for graph projection. */
export const flattenSemanticReturnValue = (value) => {
    const fields = [];
    const propertyCoverage = [];
    flattenValue(value, "", fields, propertyCoverage);
    fields.sort((left, right) => compareCodePoints(left.path, right.path));
    propertyCoverage.sort((left, right) => compareCodePoints(left.path, right.path));
    return { fields, propertyCoverage };
};
const flattenValue = (value, path, fields, coverage) => {
    if (value.status === "literal") {
        fields.push({ path, state: "literal", value: value.value, reason: null });
        return;
    }
    if (value.status === "union") {
        fields.push({
            path,
            state: "union",
            value: [...value.values],
            reason: null,
        });
        return;
    }
    if (value.status === "object") {
        coverage.push(value.unknownProperties
            ? { path, status: "partial", omitted: value.omittedProperties }
            : { path, status: "complete", omitted: 0 });
        for (const property of value.properties)
            flattenValue(property.value, `${path}/${escapePointer(property.name)}`, fields, coverage);
        return;
    }
    if (value.status === "array") {
        coverage.push(value.unknownItems
            ? { path, status: "partial", omitted: value.omittedItems }
            : { path, status: "complete", omitted: 0 });
        value.items.forEach((item, index) => flattenValue(item, `${path}/${String(index)}`, fields, coverage));
        return;
    }
    fields.push({ path, state: "unknown", value: null, reason: value.reason });
};
const escapePointer = (value) => value.replaceAll("~", "~0").replaceAll("/", "~1");
