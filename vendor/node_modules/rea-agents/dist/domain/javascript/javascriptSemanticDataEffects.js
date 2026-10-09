import * as t from "@babel/types";
import { semanticBuiltinNamespacePath } from "./javascriptSemanticProvenance.js";
import { compareCodePoints } from "../canonicalOrdering.js";
import { semanticStaticPropertyKey, semanticStaticPropertyName, } from "./javascriptSemanticProjection.js";
import { resolveSemanticBindingState, semanticResolutionBlocked, } from "./javascriptSemanticState.js";
import { builtinDataEffectMethod as builtinMethod, dataEffectArgumentBindingId as argumentBindingId, dataEffectLiteralString as literalString, dataEffectMemberCallee as memberCallee, dataEffectMemberObject as memberObject, dataEffectPrimitive as primitiveValue, isSemanticProcessObject as isProcessObject, outerDataEffectBinding as outerAssignedBinding, assignedSemanticResultBindings, semanticProjectedBindingFacts, traverseDataEffects as traverseWithContext, } from "./javascriptSemanticDataEffectHelpers.js";
import { range } from "./javascriptStaticAnalysisHelpers.js";
/** Recover configuration, request, and boundary candidates from inert syntax. */
export const collectJavaScriptSemanticDataEffects = (program, state, callables) => {
    const context = {
        state,
        callableIds: new Set(callables.map(({ callableId }) => callableId)),
        callableStack: [],
        ancestors: [],
    };
    const configuration = collectConfigurations(program, context);
    const requests = collectRequests(program, context);
    return {
        configurationOperations: [
            ...configuration.map(({ operation }) => operation),
            ...collectDefaults(program, context, configuration),
        ],
        requestOperations: [
            ...requests.map(({ operation }) => operation),
            ...collectResponseConsumers(program, context, requests),
        ],
        boundaryOperations: collectBoundaries(program, context),
    };
};
const collectConfigurations = (program, context) => {
    const output = [];
    traverseWithContext(program, context, (node, parent) => {
        const details = configurationDetails(node, parent, context);
        if (details === null)
            return;
        const operation = {
            configId: `config:${details.kind}:${String(node.start ?? -1)}:${String(node.end ?? -1)}`,
            kind: details.kind,
            location: range(node),
            ownerCallableId: context.callableStack.at(-1) ?? null,
            resultBindingId: outerAssignedBinding(node, context),
            key: details.key,
            sourceConfigId: null,
            value: null,
            resolution: details.resolution,
        };
        output.push({ node, operation });
    });
    return output;
};
const configurationDetails = (node, parent, context) => {
    if ((t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) &&
        !(memberObject(parent) === node)) {
        const processMember = processConfigurationMember(node, context.state);
        if (processMember !== null)
            return processMember;
    }
    if (!t.isCallExpression(node) && !t.isOptionalCallExpression(node))
        return null;
    const fileMethod = builtinMethod(node.callee, context.state, [
        "fs",
        "node:fs",
    ]);
    return fileMethod === "readFile" || fileMethod === "readFileSync"
        ? {
            kind: "file",
            key: literalString(node.arguments[0]),
            resolution: literalString(node.arguments[0]) === null ? "partial" : "complete",
        }
        : null;
};
const processConfigurationMember = (node, state) => {
    const object = node.object;
    if (!t.isMemberExpression(object) && !t.isOptionalMemberExpression(object))
        return null;
    if (!isProcessObject(object.object, state))
        return null;
    const family = semanticStaticPropertyName(object.property, object.computed);
    if (family !== "env" && family !== "argv")
        return null;
    // `process.env[""]` names an exact (empty) key; only a dynamic key is unknown.
    const key = semanticStaticPropertyKey(node.property, node.computed);
    if (family === "argv" && key !== null && !isArrayIndexKey(key))
        return null;
    return {
        kind: family === "env" ? "environment" : "argv",
        key,
        resolution: key === null ? "partial" : "complete",
    };
};
const isArrayIndexKey = (key) => {
    if (!/^(?:0|[1-9][0-9]*)$/u.test(key))
        return false;
    const index = Number(key);
    return Number.isSafeInteger(index) && index < 2 ** 32 - 1;
};
const collectDefaults = (program, context, configurations) => {
    const output = [];
    const configurationsByNode = new Map(configurations.map((candidate) => [candidate.node, candidate]));
    traverseWithContext(program, context, (node) => {
        if (!t.isLogicalExpression(node) ||
            (node.operator !== "??" && node.operator !== "||"))
            return;
        let source = node.left;
        while (t.isParenthesizedExpression(source) ||
            t.isTSAsExpression(source) ||
            t.isTSTypeAssertion(source) ||
            t.isTypeCastExpression(source) ||
            t.isTSSatisfiesExpression(source) ||
            t.isTSNonNullExpression(source))
            source = source.expression;
        const candidate = configurationsByNode.get(source);
        if (candidate === undefined)
            return;
        output.push({
            configId: `config:default:${String(node.start ?? -1)}:${String(node.end ?? -1)}`,
            kind: "default",
            location: range(node.right),
            ownerCallableId: context.callableStack.at(-1) ?? null,
            resultBindingId: outerAssignedBinding(node, context),
            key: candidate.operation.key,
            sourceConfigId: candidate.operation.configId,
            value: primitiveValue(node.right),
            resolution: primitiveValue(node.right) === null ? "partial" : "complete",
        });
    });
    return output;
};
const collectRequests = (program, context) => {
    const output = [];
    traverseWithContext(program, context, (node) => {
        if (!t.isCallExpression(node) &&
            !t.isOptionalCallExpression(node) &&
            !t.isNewExpression(node))
            return;
        const method = requestMethod(node, context.state);
        if (method === null)
            return;
        const endpoint = requestEndpoint(node);
        output.push({
            node,
            operation: {
                requestId: `request:${String(node.start ?? -1)}:${String(node.end ?? -1)}`,
                kind: "request",
                method,
                location: range(node),
                ownerCallableId: context.callableStack.at(-1) ?? null,
                resultBindingId: outerAssignedBinding(node, context),
                projectedResultBindings: semanticProjectedBindingFacts(assignedSemanticResultBindings(node, context.ancestors, context.state).filter(({ projectionPath }) => projectionPath.length > 0)),
                linkedRequestIds: [],
                endpoint,
                fields: requestFields(node, method, context.state),
                resolution: endpoint === null ? "partial" : "complete",
            },
        });
    });
    return output;
};
const collectResponseConsumers = (program, context, requests) => {
    const requestsByBinding = new Map();
    for (const request of requests) {
        const bindingIds = [
            ...(request.operation.resultBindingId === null
                ? []
                : [request.operation.resultBindingId]),
            ...request.operation.projectedResultBindings.map(({ bindingId }) => bindingId),
        ];
        for (const bindingId of bindingIds) {
            const existing = requestsByBinding.get(bindingId) ?? [];
            existing.push(request);
            requestsByBinding.set(bindingId, existing);
        }
    }
    const output = [];
    traverseWithContext(program, context, (node) => {
        if (!t.isCallExpression(node) && !t.isOptionalCallExpression(node))
            return;
        const member = memberCallee(node);
        if (member === null || !t.isIdentifier(member.object))
            return;
        const method = semanticStaticPropertyName(member.property, member.computed);
        if (method !== "json" && method !== "text" && method !== "arrayBuffer")
            return;
        const binding = resolveSemanticBindingState(context.state, member.object, member.object.name);
        const linked = binding === undefined
            ? []
            : (requestsByBinding.get(binding.bindingId) ?? []);
        if (linked.length === 0)
            return;
        output.push({
            requestId: `response:${String(node.start ?? -1)}:${String(node.end ?? -1)}`,
            kind: "response-consumer",
            method,
            location: range(node),
            ownerCallableId: context.callableStack.at(-1) ?? null,
            resultBindingId: outerAssignedBinding(node, context),
            projectedResultBindings: semanticProjectedBindingFacts(assignedSemanticResultBindings(node, context.ancestors, context.state).filter(({ projectionPath }) => projectionPath.length > 0)),
            linkedRequestIds: linked
                .map(({ operation }) => operation.requestId)
                .sort(compareCodePoints),
            endpoint: null,
            fields: [],
            resolution: linked.length === 1 &&
                !linked[0]?.operation.projectedResultBindings.some(({ bindingId }) => bindingId === binding?.bindingId)
                ? "complete"
                : "partial",
        });
    });
    return output;
};
const collectBoundaries = (program, context) => {
    const output = [];
    traverseWithContext(program, context, (node) => {
        if (!t.isCallExpression(node) && !t.isOptionalCallExpression(node))
            return;
        const details = boundaryDetails(node, context.state);
        if (details === null)
            return;
        output.push({
            boundaryId: `boundary:${details.kind}:${String(node.start ?? -1)}:${String(node.end ?? -1)}`,
            kind: details.kind,
            method: details.method,
            location: range(node),
            ownerCallableId: context.callableStack.at(-1) ?? null,
            sourceBindingId: argumentBindingId(node.arguments[0], context.state),
            resultBindingId: outerAssignedBinding(node, context),
            resolution: details.resolution,
        });
    });
    return output;
};
const boundaryDetails = (node, state) => {
    if (t.isIdentifier(node.callee)) {
        const name = node.callee.name;
        const unbound = resolveSemanticBindingState(state, node.callee, name) === undefined &&
            !semanticResolutionBlocked(state, node.callee, name);
        if (unbound &&
            ["String", "Number", "Boolean", "parseInt", "parseFloat"].includes(name))
            return { kind: "coerce", method: name, resolution: "complete" };
    }
    const member = memberCallee(node);
    if (member === null)
        return null;
    const method = semanticStaticPropertyName(member.property, member.computed);
    if (method === "parse" &&
        t.isIdentifier(member.object, { name: "JSON" }) &&
        resolveSemanticBindingState(state, member.object, "JSON") === undefined &&
        !semanticResolutionBlocked(state, member.object, "JSON"))
        return { kind: "parse", method: "JSON.parse", resolution: "complete" };
    if (method === "parse" || method === "safeParse")
        return { kind: "parse", method, resolution: "partial" };
    if (method === "validate" || method === "assert" || method === "is")
        return { kind: "validate", method, resolution: "partial" };
    return null;
};
const requestMethod = (node, state) => {
    if (t.isIdentifier(node.callee)) {
        const name = node.callee.name;
        const unbound = resolveSemanticBindingState(state, node.callee, name) === undefined &&
            !semanticResolutionBlocked(state, node.callee, name);
        if (!t.isNewExpression(node) && unbound && name === "fetch")
            return "fetch";
        if (t.isNewExpression(node) && unbound && name === "WebSocket")
            return "WebSocket";
    }
    const member = memberCallee(node);
    if (member === null || !t.isIdentifier(member.object))
        return null;
    const method = semanticStaticPropertyName(member.property, member.computed);
    if (method !== "request" && method !== "get")
        return null;
    const binding = resolveSemanticBindingState(state, member.object, member.object.name);
    return binding?.directOrigins.some(({ specifier, importedPath }) => ["http", "https", "node:http", "node:https"].includes(specifier) &&
        semanticBuiltinNamespacePath(importedPath))
        ? method
        : null;
};
const requestFields = (node, method, state) => {
    const candidate = method === "fetch" || method === "WebSocket"
        ? node.arguments[1]
        : t.isObjectExpression(node.arguments[0])
            ? node.arguments[0]
            : node.arguments[1];
    if (!t.isObjectExpression(candidate))
        return [];
    return candidate.properties.flatMap((property) => {
        if (!t.isObjectProperty(property))
            return [];
        // `{[key]: 1}` sends no knowable field name; reporting `key` would invent
        // a request field that may not exist.
        const name = semanticStaticPropertyKey(property.key, property.computed);
        if (name === null)
            return [];
        return [
            {
                name,
                sourceBindingId: t.isIdentifier(property.value)
                    ? (resolveSemanticBindingState(state, property.value, property.value.name)?.bindingId ?? null)
                    : null,
            },
        ];
    });
};
const requestEndpoint = (node) => t.isObjectExpression(node.arguments[0])
    ? null
    : literalString(node.arguments[0]);
