import * as t from "@babel/types";
import { semanticCallableIdForNode, semanticReadsBeforeWrite, semanticStaticPropertyKey, } from "./javascriptSemanticProjection.js";
import { resolveSemanticBindingState, } from "./javascriptSemanticState.js";
import { traverseJavaScriptAst } from "./javascriptSemanticTraversal.js";
import { range } from "./javascriptStaticAnalysisHelpers.js";
/** Recover bounded static property reads, writes, spreads, and destructuring. */
export const collectJavaScriptSemanticObjects = (program, state, callables) => {
    const output = [];
    const callableIds = new Set(callables.map(({ callableId }) => callableId));
    const callableStack = [];
    const context = { state, output };
    traverseJavaScriptAst(program, {
        enter: (node, parent) => {
            const callableId = semanticCallableIdForNode(node);
            if (callableId !== null && callableIds.has(callableId))
                callableStack.push(callableId);
            const ownerCallableId = callableStack.at(-1) ?? null;
            if (t.isMemberExpression(node) || t.isOptionalMemberExpression(node))
                collectMember(node, parent, ownerCallableId, context);
            else if (t.isSpreadElement(node) &&
                parent !== null &&
                t.isObjectExpression(parent))
                addObjectOperation({
                    node,
                    kind: "spread",
                    ownerCallableId,
                    objectBindingId: expressionBindingId(node.argument, state),
                    targetBindingId: null,
                    propertyName: null,
                }, state, output);
            else if (t.isVariableDeclarator(node) && t.isObjectPattern(node.id))
                collectDestructuring(node, ownerCallableId, state, output);
        },
        exit: (node) => {
            const callableId = semanticCallableIdForNode(node);
            if (callableId !== null && callableStack.at(-1) === callableId)
                callableStack.pop();
        },
    });
    return output;
};
const collectMember = (node, parent, ownerCallableId, context) => {
    const { state, output } = context;
    const name = semanticStaticPropertyKey(node.property, node.computed);
    if (name === null)
        return;
    const write = (t.isAssignmentExpression(parent) && parent.left === node) ||
        (t.isUpdateExpression(parent) && parent.argument === node);
    const readsBeforeWrite = write && semanticReadsBeforeWrite(node, parent);
    if (readsBeforeWrite)
        addObjectOperation({
            node,
            kind: "read",
            ownerCallableId,
            objectBindingId: expressionBindingId(node.object, state),
            targetBindingId: null,
            propertyName: name,
        }, state, output);
    addObjectOperation({
        node,
        kind: write ? "write" : "read",
        ownerCallableId,
        objectBindingId: expressionBindingId(node.object, state),
        targetBindingId: null,
        propertyName: name,
    }, state, output);
};
const collectDestructuring = (node, ownerCallableId, state, output) => {
    if (!t.isObjectPattern(node.id))
        return;
    const objectBindingId = expressionBindingId(node.init, state);
    for (const property of node.id.properties) {
        if (!t.isObjectProperty(property))
            continue;
        const name = semanticStaticPropertyKey(property.key, property.computed);
        if (name === null)
            continue;
        const target = bindingIdentifier(property.value);
        addObjectOperation({
            node: property,
            kind: "destructure",
            ownerCallableId,
            objectBindingId,
            targetBindingId: target === null
                ? null
                : (resolveSemanticBindingState(state, target, target.name)
                    ?.bindingId ?? null),
            propertyName: name,
        }, state, output);
    }
};
const addObjectOperation = (input, state, output) => {
    output.push({
        objectOperationId: `object:${input.kind}:${String(input.node.start ?? -1)}:${String(input.node.end ?? -1)}`,
        kind: input.kind,
        location: range(input.node),
        ownerCallableId: input.ownerCallableId,
        objectBindingId: input.objectBindingId,
        targetBindingId: input.targetBindingId,
        propertyName: input.propertyName,
        resolution: input.kind === "spread"
            ? input.objectBindingId === null
                ? "partial"
                : "complete"
            : input.objectBindingId === null ||
                input.propertyName === null ||
                (input.kind === "destructure" && input.targetBindingId === null)
                ? "partial"
                : "complete",
    });
};
const expressionBindingId = (node, state) => t.isIdentifier(node)
    ? (resolveSemanticBindingState(state, node, node.name)?.bindingId ?? null)
    : null;
const bindingIdentifier = (node) => {
    if (t.isIdentifier(node))
        return node;
    if (t.isAssignmentPattern(node) && t.isIdentifier(node.left))
        return node.left;
    return null;
};
