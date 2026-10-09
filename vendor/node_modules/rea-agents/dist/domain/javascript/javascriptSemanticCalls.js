import * as t from "@babel/types";
import { semanticCallableIdForNode, semanticReferenceRole, semanticStaticPropertyKey, } from "./javascriptSemanticProjection.js";
import { resolveSemanticBindingState, isUnshadowedGlobal, } from "./javascriptSemanticState.js";
import { parameterBindings, resolveLocalCallables, } from "./javascriptSemanticCallResolution.js";
import { traverseJavaScriptAst } from "./javascriptSemanticTraversal.js";
import { range } from "./javascriptStaticAnalysisHelpers.js";
import { assignedSemanticResultBindings } from "./javascriptSemanticDataEffectHelpers.js";
/** Recover direct-call and lexical-capture candidates from inert syntax. */
export const collectJavaScriptSemanticCalls = (program, state, callables) => {
    const output = {
        callSites: [],
        argumentFlows: [],
        callReturnFlows: [],
        callResultFlows: [],
        closureCaptures: [],
        frontiers: [],
    };
    const callableById = new Map(callables.map((callable) => [callable.callableId, callable]));
    const context = {
        state,
        callableById,
        output,
        bindingResolutionCache: new Map(),
        parameterBindingCache: new Map(),
        ancestors: [],
    };
    const callableStack = [];
    traverseJavaScriptAst(program, {
        enter: (node, parent) => {
            const callableId = semanticCallableIdForNode(node);
            const callable = callableId === null ? undefined : callableById.get(callableId);
            if (callable !== undefined)
                callableStack.push(callable);
            const owner = enclosingFunction(callableStack);
            collectCapture(node, parent, owner, context);
            collectDynamicProperty(node, owner, state, output);
            collectDynamicScope(node, owner, state, output);
            if (t.isCallExpression(node) ||
                t.isOptionalCallExpression(node) ||
                t.isNewExpression(node))
                collectCallSite(node, parent, owner, context);
            context.ancestors.push(node);
        },
        exit: (node) => {
            context.ancestors.pop();
            const callableId = semanticCallableIdForNode(node);
            if (callableId !== null &&
                callableStack.at(-1)?.callableId === callableId)
                callableStack.pop();
        },
    });
    return {
        callSites: output.callSites,
        argumentFlows: output.argumentFlows,
        callReturnFlows: output.callReturnFlows,
        callResultFlows: output.callResultFlows,
        closureCaptures: output.closureCaptures,
        frontiers: output.frontiers,
    };
};
const collectCallSite = (node, parent, owner, context) => {
    const { state, callableById, output } = context;
    const resolution = resolveLocalCallables({
        node: node.callee,
        state,
        callableById,
        seenBindings: new Set(),
        bindingCache: context.bindingResolutionCache,
    });
    const callSiteId = semanticCallSiteId(node);
    const argumentsValue = retainedArguments(node.arguments);
    const site = {
        callSiteId,
        kind: t.isNewExpression(node) ? "construct" : "call",
        callerCallableId: owner?.callableId ?? null,
        location: range(node),
        calleeLocation: range(node.callee),
        resolution: resolution.callableIds.length === 1 && resolution.complete
            ? "exact"
            : resolution.callableIds.length > 0
                ? "ambiguous"
                : "unresolved",
        calleeCallableIds: resolution.callableIds,
        arguments: argumentsValue,
    };
    output.callSites.push(site);
    collectCallResultFlow(site, node, context);
    if (site.resolution !== "exact")
        addFrontier({
            kind: "dynamic-call",
            callableId: owner?.callableId ?? null,
            location: range(node.callee),
            reason: resolution.reason,
        }, state, output);
    collectArgumentFlows(site, node, context);
    if (site.kind === "call")
        collectReturnFlows(site, callableById, state, output);
};
const collectCallResultFlow = (site, node, context) => {
    for (const assigned of assignedSemanticResultBindings(node, context.ancestors, context.state).filter(({ projectionPath }) => projectionPath.length === 0)) {
        const binding = context.state.bindingsById.get(assigned.bindingId);
        if (binding === undefined)
            continue;
        const identifierRange = range(assigned.identifier);
        const definition = binding.definitions.find(({ location }) => location.start.line === identifierRange.start.line &&
            location.start.column === identifierRange.start.column &&
            location.end.line === identifierRange.end.line &&
            location.end.column === identifierRange.end.column);
        if (definition === undefined)
            continue;
        context.output.callResultFlows.push({
            callSiteId: site.callSiteId,
            bindingId: binding.bindingId,
            definitionLocation: definition.location,
        });
    }
};
const retainedArguments = (nodes) => {
    const retained = [];
    for (const [index, node] of nodes.entries()) {
        // Babel recovery can leave null slots; retain the other argument positions.
        if (node === null)
            continue;
        retained.push({
            index,
            location: range(node),
            spread: t.isSpreadElement(node),
        });
    }
    return retained;
};
const collectArgumentFlows = (site, node, context) => {
    const { callableById, output } = context;
    const retainedIndexes = new Set(site.arguments.map(({ index }) => index));
    let positionIsExact = true;
    for (const [index, argument] of node.arguments.entries()) {
        if (t.isSpreadElement(argument)) {
            positionIsExact = false;
            continue;
        }
        if (!positionIsExact ||
            !retainedIndexes.has(index) ||
            !t.isExpression(argument))
            continue;
        for (const callableId of site.calleeCallableIds) {
            const callable = callableById.get(callableId);
            if (callable === undefined)
                continue;
            for (const parameter of cachedParameterBindings(callable, index, context)) {
                const definition = parameter.definitions.find(({ kind }) => kind === "parameter");
                if (definition === undefined)
                    continue;
                output.argumentFlows.push({
                    callSiteId: site.callSiteId,
                    argumentIndex: index,
                    argumentLocation: range(argument),
                    callableId,
                    parameterBindingId: parameter.bindingId,
                    parameterLocation: definition.location,
                });
            }
        }
    }
};
const cachedParameterBindings = (callable, index, context) => {
    const key = `${callable.callableId}:${String(index)}`;
    const cached = context.parameterBindingCache.get(key);
    if (cached !== undefined)
        return cached;
    const bindings = parameterBindings(callable, index, context.state);
    context.parameterBindingCache.set(key, bindings);
    return bindings;
};
const collectReturnFlows = (site, callableById, state, output) => {
    for (const callableId of site.calleeCallableIds) {
        const callable = callableById.get(callableId);
        if (callable === undefined)
            continue;
        for (const returnSite of callable.returnSites) {
            output.callReturnFlows.push({
                callSiteId: site.callSiteId,
                callableId,
                returnSiteId: returnSite.returnSiteId,
                returnLocation: returnSite.location,
            });
        }
    }
};
const collectCapture = (node, parent, owner, context) => {
    const { state, output } = context;
    if (!t.isIdentifier(node) ||
        parent === null ||
        owner === undefined ||
        owner.bodyScopeId === null)
        return;
    if (semanticReferenceRole(node, parent) === null)
        return;
    const binding = resolveSemanticBindingState(state, node, node.name);
    if (binding === undefined ||
        bindingIsWithinCallable(binding, owner.bodyScopeId, state))
        return;
    output.closureCaptures.push({
        callableId: owner.callableId,
        bindingId: binding.bindingId,
        referenceLocation: range(node),
    });
};
const collectDynamicProperty = (node, owner, state, output) => {
    if ((t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) &&
        semanticStaticPropertyKey(node.property, node.computed) === null)
        addFrontier({
            kind: "dynamic-property",
            callableId: owner?.callableId ?? null,
            location: range(node.property),
            reason: "Computed member property is not a static string or number.",
        }, state, output);
    else if ((t.isObjectProperty(node) || t.isObjectMethod(node)) &&
        node.computed &&
        semanticStaticPropertyKey(node.key, true) === null)
        addFrontier({
            kind: "dynamic-property",
            callableId: owner?.callableId ?? null,
            location: range(node.key),
            reason: "Computed object property is not a static string or number.",
        }, state, output);
};
/**
 * `with (o) { … }` and `eval("…")` decide at runtime which bindings exist, so
 * every name inside them is unresolvable statically. Recording the frontier
 * is what keeps the analyzer from presenting an empty or partial resolution as
 * an observed fact — silence here would read as "nothing to resolve".
 */
const collectDynamicScope = (node, owner, state, output) => {
    const reason = t.isWithStatement(node)
        ? "`with` introduces a runtime binding environment; names inside are not statically resolvable."
        : t.isCallExpression(node) && isUnshadowedGlobal(node.callee, state, "eval")
            ? "`eval` can declare bindings at runtime; names inside the evaluated source are not statically resolvable."
            : null;
    if (reason === null)
        return;
    addFrontier({
        kind: "dynamic-scope",
        callableId: owner?.callableId ?? null,
        location: range(node),
        reason,
    }, state, output);
};
const addFrontier = (frontier, state, output) => {
    output.frontiers.push(frontier);
};
const bindingIsWithinCallable = (binding, bodyScopeId, state) => {
    let scope = state.scopesById.get(binding.scopeId);
    while (scope !== undefined) {
        if (scope.scopeId === bodyScopeId)
            return true;
        scope =
            scope.parentScopeId === null
                ? undefined
                : state.scopesById.get(scope.parentScopeId);
    }
    return false;
};
const enclosingFunction = (stack) => stack.findLast(({ kind }) => kind !== "class");
const semanticCallSiteId = (node) => `call:${t.isNewExpression(node) ? "construct" : "call"}:${String(node.start ?? -1)}:${String(node.end ?? -1)}`;
