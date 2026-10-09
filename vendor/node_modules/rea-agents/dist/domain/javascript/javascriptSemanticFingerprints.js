import { createHash } from "node:crypto";
import * as t from "@babel/types";
import { compareCodePoints } from "../canonicalOrdering.js";
import { semanticCallableIdForNode } from "./javascriptSemanticProjection.js";
import { traverseJavaScriptAst } from "./javascriptSemanticTraversal.js";
/** Build bounded rename- and formatting-resistant components per callable. */
export const collectJavaScriptSemanticFingerprints = (input) => {
    const { state, callables, calls, promises, events, timers, childProcessSpawns, childProcessInteractions, requestOperations, resourceOperations, parserPartial, } = input;
    const callSitesByCaller = groupByOwner(calls.callSites, ({ callerCallableId }) => callerCallableId);
    const captureCountByCallable = countByOwner(calls.closureCaptures, ({ callableId }) => callableId);
    const promiseEffectsByOwner = groupByOwner(promises, ownerId);
    const eventEffectsByOwner = groupByOwner(events, ownerId);
    const timerEffectsByOwner = groupByOwner(timers, ownerId);
    const childProcessEffectsByOwner = groupByOwner([...childProcessSpawns, ...childProcessInteractions], ownerId);
    const networkEffectsByOwner = groupByOwner(requestOperations, ownerId);
    const resourceEffectsByOwner = groupByOwner(resourceOperations, ownerId);
    return callables.flatMap((callable) => {
        if (callable.kind === "class")
            return [];
        const node = state.callableNodesById.get(callable.callableId);
        if (node === undefined)
            return [];
        const syntax = fingerprintSyntax(node, callable.callableId);
        const promiseEffects = promiseEffectsByOwner.get(callable.callableId) ?? [];
        const eventEffects = eventEffectsByOwner.get(callable.callableId) ?? [];
        const timerEffects = timerEffectsByOwner.get(callable.callableId) ?? [];
        const childProcessEffects = childProcessEffectsByOwner.get(callable.callableId) ?? [];
        const networkEffects = networkEffectsByOwner.get(callable.callableId) ?? [];
        const resourceEffects = resourceEffectsByOwner.get(callable.callableId) ?? [];
        return [
            {
                callableId: callable.callableId,
                status: parserPartial || callable.returnCoverage.status !== "complete"
                    ? "partial"
                    : "complete",
                components: {
                    parameterArity: callableParameterArity(node),
                    normalizedAstSha256: digest(syntax.normalizedTokens),
                    controlFlowSha256: digest(syntax.controlFlowTokens),
                    relationShapeSha256: digest(relationShape(callable, callSitesByCaller.get(callable.callableId) ?? [], captureCountByCallable.get(callable.callableId) ?? 0, promiseEffects)),
                    literalSetSha256: digest([...new Set(syntax.literals)].sort(compareCodePoints)),
                    effects: [
                        ...(isAsyncCallable(node) ? ["async"] : []),
                        ...(childProcessEffects.length > 0
                            ? ["child-process"]
                            : []),
                        ...(eventEffects.length > 0 ? ["event"] : []),
                        ...(networkEffects.length > 0 ? ["network"] : []),
                        ...(promiseEffects.length > 0 ? ["promise"] : []),
                        ...(resourceEffects.length > 0 ? ["resource"] : []),
                        ...(timerEffects.length > 0 ? ["timer"] : []),
                    ],
                },
                limitations: [
                    "The fingerprint is a static candidate and does not prove behavioral equivalence.",
                    ...(parserPartial
                        ? ["Incomplete semantic recovery makes this fingerprint partial."]
                        : []),
                ],
            },
        ];
    });
};
const ownerId = (value) => value.ownerCallableId;
const groupByOwner = (values, getOwner) => {
    const grouped = new Map();
    for (const value of values) {
        const owner = getOwner(value);
        const ownedValues = grouped.get(owner);
        if (ownedValues === undefined)
            grouped.set(owner, [value]);
        else
            ownedValues.push(value);
    }
    return grouped;
};
const countByOwner = (values, getOwner) => {
    const counts = new Map();
    for (const value of values) {
        const owner = getOwner(value);
        counts.set(owner, (counts.get(owner) ?? 0) + 1);
    }
    return counts;
};
const fingerprintSyntax = (root, targetCallableId) => {
    const normalizedTokens = [];
    const controlFlowTokens = [];
    const literals = [];
    const callableStack = [];
    traverseJavaScriptAst(root, {
        enter: (node, parent) => {
            const callableId = semanticCallableIdForNode(node);
            if (callableId !== null)
                callableStack.push(callableId);
            if (callableStack.at(-1) !== targetCallableId)
                return;
            normalizedTokens.push(normalizedNodeToken(node, parent));
            const control = controlFlowToken(node);
            if (control !== null)
                controlFlowTokens.push(control);
            const literal = semanticLiteral(node);
            if (literal !== null)
                literals.push(literal);
        },
        exit: (node) => {
            const callableId = semanticCallableIdForNode(node);
            if (callableId !== null && callableStack.at(-1) === callableId)
                callableStack.pop();
        },
    });
    return { normalizedTokens, controlFlowTokens, literals };
};
const normalizedNodeToken = (node, parent) => {
    if (t.isIdentifier(node))
        return propertyIdentity(node, parent)
            ? `property:${node.name}`
            : "identifier";
    if (t.isStringLiteral(node))
        return propertyIdentity(node, parent)
            ? `property:${node.value}`
            : "string-literal";
    const attributes = [
        primitiveAttribute(node, "operator"),
        primitiveAttribute(node, "kind"),
        primitiveAttribute(node, "computed"),
        primitiveAttribute(node, "optional"),
        primitiveAttribute(node, "async"),
        primitiveAttribute(node, "generator"),
    ].filter((value) => value !== null);
    return [node.type, ...attributes].join(":");
};
const primitiveAttribute = (node, key) => {
    const value = Reflect.get(node, key);
    return typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
        ? `${key}=${String(value)}`
        : null;
};
const propertyIdentity = (node, parent) => {
    if (parent === null)
        return false;
    if ((t.isMemberExpression(parent) || t.isOptionalMemberExpression(parent)) &&
        parent.property === node)
        return !parent.computed || t.isStringLiteral(node);
    if ((t.isObjectProperty(parent) ||
        t.isObjectMethod(parent) ||
        t.isClassMethod(parent) ||
        t.isClassProperty(parent)) &&
        parent.key === node)
        return !parent.computed || t.isStringLiteral(node);
    return false;
};
const controlFlowToken = (node) => {
    if (!t.isIfStatement(node) &&
        !t.isConditionalExpression(node) &&
        !t.isSwitchStatement(node) &&
        !t.isSwitchCase(node) &&
        !t.isLoop(node) &&
        !t.isTryStatement(node) &&
        !t.isCatchClause(node) &&
        !t.isReturnStatement(node) &&
        !t.isThrowStatement(node) &&
        !t.isAwaitExpression(node) &&
        !t.isYieldExpression(node) &&
        !t.isLogicalExpression(node))
        return null;
    const operator = primitiveAttribute(node, "operator");
    return operator === null ? node.type : `${node.type}:${operator}`;
};
const semanticLiteral = (node) => {
    if (t.isStringLiteral(node))
        return `string:${node.value}`;
    if (t.isNumericLiteral(node))
        return `number:${String(node.value)}`;
    if (t.isBooleanLiteral(node))
        return `boolean:${String(node.value)}`;
    if (t.isNullLiteral(node))
        return "null";
    if (t.isBigIntLiteral(node))
        return `bigint:${node.value}`;
    if (t.isRegExpLiteral(node))
        return `regexp:${node.pattern}/${node.flags}`;
    if (t.isTemplateElement(node))
        return `template:${node.value.cooked ?? node.value.raw}`;
    return null;
};
const relationShape = (callable, callSites, captureCount, promises) => [
    `returns:${String(callable.returnSites.length)}:${callable.returnCoverage.status}`,
    ...callSites.map(({ kind, resolution, arguments: args, calleeCallableIds }) => `call:${kind}:${resolution}:${String(args.length)}:${String(calleeCallableIds.length)}`),
    `captures:${String(captureCount)}`,
    ...promises.map(({ kind, method, ownership, sourceResolution }) => `promise:${kind}:${method}:${ownership}:${sourceResolution}`),
];
const callableParameterArity = (node) => t.isFunction(node) ? node.params.length : 0;
const isAsyncCallable = (node) => t.isFunction(node) && node.async;
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
