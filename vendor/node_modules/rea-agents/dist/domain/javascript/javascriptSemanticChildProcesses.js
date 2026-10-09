import * as t from "@babel/types";
import { semanticBuiltinNamespacePath } from "./javascriptSemanticProvenance.js";
import { semanticCallableIdForNode, semanticStaticPropertyName, } from "./javascriptSemanticProjection.js";
import { resolveSemanticBindingState, } from "./javascriptSemanticState.js";
import { compareCodePoints } from "../canonicalOrdering.js";
import { traverseJavaScriptAst } from "./javascriptSemanticTraversal.js";
import { range } from "./javascriptStaticAnalysisHelpers.js";
import { dataEffectLiteralString, dataEffectMemberCallee, assignedSemanticResultBindings, scalarAssignedResultBinding, semanticProjectedBindingFacts, } from "./javascriptSemanticDataEffectHelpers.js";
const CHILD_PROCESS_METHODS = ["spawn", "exec", "execFile", "fork"];
const CHILD_LISTENER_METHODS = ["on", "once", "addListener"];
/** Recover explicit asynchronous node:child_process ownership candidates. */
export const collectJavaScriptSemanticChildProcesses = (program, state, callables) => {
    const candidates = collectSpawns(program, state, callables);
    const childProcessSpawns = candidates.map((candidate) => immutableSpawn(candidate));
    return {
        childProcessSpawns,
        childProcessInteractions: collectInteractions(program, state, callables, candidates),
    };
};
const collectSpawns = (program, state, callables) => {
    const output = [];
    const admittedCallables = new Set(callables.map(({ callableId }) => callableId));
    const callableStack = [];
    const ancestors = [];
    traverseJavaScriptAst(program, {
        enter: (node) => {
            const callableId = semanticCallableIdForNode(node);
            if (callableId !== null && admittedCallables.has(callableId))
                callableStack.push(callableId);
            if (t.isCallExpression(node) || t.isOptionalCallExpression(node)) {
                const method = childProcessMethod(node.callee, state);
                if (method !== null) {
                    const projectedResultBindings = assignedSemanticResultBindings(node, ancestors, state);
                    output.push({
                        node,
                        method,
                        ownerCallableId: callableStack.at(-1) ?? null,
                        resultBindingId: scalarAssignedResultBinding(projectedResultBindings),
                        projectedResultBindings: semanticProjectedBindingFacts(projectedResultBindings.filter(({ projectionPath }) => projectionPath.length > 0)),
                    });
                }
            }
            ancestors.push(node);
        },
        exit: (node) => {
            ancestors.pop();
            popCallable(node, callableStack);
        },
    });
    return output;
};
const immutableSpawn = (candidate) => {
    const options = spawnOptions(candidate);
    const command = dataEffectLiteralString(candidate.node.arguments[0]);
    return {
        processId: spawnId(candidate),
        method: candidate.method,
        location: range(candidate.node),
        ownerCallableId: candidate.ownerCallableId,
        resultBindingId: candidate.resultBindingId,
        projectedResultBindings: candidate.projectedResultBindings,
        command,
        argvCount: spawnArgvCount(candidate),
        environmentSupplied: objectHasProperty(options, "env"),
        stdioMode: stdioMode(options),
        resolution: command === null ? "partial" : "complete",
    };
};
const collectInteractions = (program, state, callables, spawns) => {
    const output = [];
    const callableIds = new Set(callables.map(({ callableId }) => callableId));
    const callableStack = [];
    const spawnByNode = new WeakMap();
    const spawnsByBinding = new Map();
    for (const spawn of spawns) {
        spawnByNode.set(spawn.node, spawn);
        const ids = [
            ...(spawn.resultBindingId === null ? [] : [spawn.resultBindingId]),
            ...spawn.projectedResultBindings.map(({ bindingId }) => bindingId),
        ];
        for (const id of ids) {
            const existing = spawnsByBinding.get(id) ?? [];
            existing.push(spawn);
            spawnsByBinding.set(id, existing);
        }
    }
    const context = {
        state,
        spawnByNode,
        spawnsByBinding,
    };
    traverseJavaScriptAst(program, {
        enter: (node) => {
            const callableId = semanticCallableIdForNode(node);
            if (callableId !== null && callableIds.has(callableId))
                callableStack.push(callableId);
            if (!t.isCallExpression(node) && !t.isOptionalCallExpression(node))
                return;
            const interaction = childInteraction(node, callableStack.at(-1) ?? null, context);
            if (interaction === null)
                return;
            output.push(interaction);
        },
        exit: (node) => popCallable(node, callableStack),
    });
    return output;
};
const childInteraction = (node, ownerCallableId, context) => {
    const { state, spawnByNode, spawnsByBinding } = context;
    const member = dataEffectMemberCallee(node);
    if (member === null)
        return null;
    const method = semanticStaticPropertyName(member.property, member.computed);
    const binding = objectBinding(member.object, state);
    const linked = resolveChildCandidates(member.object, binding, spawnByNode, spawnsByBinding);
    if (linked.length === 0)
        return null;
    const classification = classifyInteraction(method, node.arguments[0]);
    if (classification === null)
        return null;
    const { kind, interactionMethod, eventName } = classification;
    const listener = node.arguments[1];
    return {
        interactionId: `child:${kind}:${String(node.start ?? -1)}:${String(node.end ?? -1)}`,
        kind,
        method: interactionMethod,
        location: range(node),
        ownerCallableId,
        processBindingId: binding?.bindingId ?? null,
        linkedProcessIds: linked
            .map((candidate) => spawnId(candidate))
            .sort(compareCodePoints),
        eventName: kind === "listener" ? eventName : null,
        signalName: kind === "signal"
            ? (dataEffectLiteralString(node.arguments[0]) ?? "SIGTERM")
            : null,
        listenerLocation: kind === "listener" && t.isNode(listener) ? range(listener) : null,
        resolution: linked.length === 1 &&
            !linked[0]?.projectedResultBindings.some(({ bindingId }) => bindingId === binding?.bindingId)
            ? "complete"
            : "partial",
    };
};
const classifyInteraction = (method, argument) => {
    if (method === "kill")
        return { kind: "signal", interactionMethod: "kill", eventName: null };
    const listenerMethod = CHILD_LISTENER_METHODS.find((candidate) => candidate === method);
    const eventName = dataEffectLiteralString(argument);
    return listenerMethod !== undefined &&
        (eventName === "exit" || eventName === "error")
        ? { kind: "listener", interactionMethod: listenerMethod, eventName }
        : null;
};
const childProcessMethod = (callee, state) => {
    if (t.isIdentifier(callee)) {
        const binding = resolveSemanticBindingState(state, callee, callee.name);
        return binding === undefined ? null : methodFromBinding(binding);
    }
    if (!t.isMemberExpression(callee) && !t.isOptionalMemberExpression(callee))
        return null;
    const method = admittedChildMethod(semanticStaticPropertyName(callee.property, callee.computed));
    if (method === null || !t.isIdentifier(callee.object))
        return null;
    const binding = resolveSemanticBindingState(state, callee.object, callee.object.name);
    return childProcessNamespace(binding) ? method : null;
};
const methodFromBinding = (binding) => {
    for (const { specifier, importedPath } of binding.directOrigins) {
        if (!childProcessModule(specifier))
            continue;
        const method = admittedChildMethod(importedPath.at(-1) ?? "");
        if (method !== null)
            return method;
    }
    return null;
};
const admittedChildMethod = (value) => CHILD_PROCESS_METHODS.find((candidate) => candidate === value) ?? null;
const childProcessNamespace = (binding) => binding?.directOrigins.some(({ specifier, importedPath }) => childProcessModule(specifier) &&
    semanticBuiltinNamespacePath(importedPath)) ?? false;
const childProcessModule = (specifier) => specifier === "child_process" || specifier === "node:child_process";
const resolveChildCandidates = (node, binding, spawnByNode, spawnsByBinding) => {
    const direct = spawnByNode.get(node);
    if (direct !== undefined)
        return [direct];
    return binding === undefined
        ? []
        : (spawnsByBinding.get(binding.bindingId) ?? []);
};
const spawnOptions = (candidate) => {
    const index = candidate.method === "exec" ? 1 : 2;
    const value = candidate.node.arguments[index];
    return t.isObjectExpression(value) ? value : null;
};
const spawnArgvCount = (candidate) => {
    if (candidate.method === "exec")
        return null;
    const args = candidate.node.arguments[1];
    return t.isArrayExpression(args) ? args.elements.length : null;
};
const objectHasProperty = (object, name) => objectProperty(object, name) !== null;
const stdioMode = (options) => {
    const property = objectProperty(options, "stdio");
    if (property === null || !t.isObjectProperty(property))
        return "default";
    if (t.isStringLiteral(property.value))
        return property.value.value;
    if (t.isArrayExpression(property.value))
        return "array";
    return "dynamic";
};
const objectProperty = (object, name) => object?.properties.find((property) => (t.isObjectMethod(property) || t.isObjectProperty(property)) &&
    // `{[env]: vars}` has a dynamic key; treating it as `env` would claim
    // the caller supplied an environment when the real key is unknown.
    semanticStaticPropertyName(property.key, property.computed) === name) ?? null;
const objectBinding = (node, state) => t.isIdentifier(node)
    ? resolveSemanticBindingState(state, node, node.name)
    : undefined;
const popCallable = (node, stack) => {
    const callableId = semanticCallableIdForNode(node);
    if (callableId !== null && stack.at(-1) === callableId)
        stack.pop();
};
const spawnId = (candidate) => `child:spawn:${String(candidate.node.start ?? -1)}:${String(candidate.node.end ?? -1)}`;
