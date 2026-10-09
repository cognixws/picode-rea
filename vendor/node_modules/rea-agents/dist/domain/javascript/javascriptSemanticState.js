import * as t from "@babel/types";
/** Return the active scope from a non-empty construction stack. */
export const currentSemanticScope = (stack) => {
    const scope = stack.at(-1);
    if (scope === undefined)
        throw new TypeError("Missing semantic scope");
    return scope;
};
/** Create a stable source-position identity for one lexical scope. */
export const semanticScopeId = (kind, node) => `scope:${kind}:${String(node.start ?? -1)}:${String(node.end ?? -1)}`;
/** Resolve one lexical name from the scope containing a node. */
export const resolveSemanticBindingState = (state, node, name) => {
    let scope = state.scopeByNode.get(node);
    while (scope !== undefined) {
        const binding = scope.bindings.get(name);
        if (binding !== undefined)
            return binding;
        if (!scope.bindingsComplete)
            return undefined;
        scope =
            scope.parentScopeId === null
                ? undefined
                : state.scopesById.get(scope.parentScopeId);
    }
    return undefined;
};
/** Report whether an omitted binding scope blocks a trustworthy miss. */
export const semanticResolutionBlocked = (state, node, name) => {
    let scope = state.scopeByNode.get(node);
    while (scope !== undefined) {
        if (scope.bindings.has(name))
            return false;
        if (!scope.bindingsComplete)
            return true;
        scope =
            scope.parentScopeId === null
                ? undefined
                : state.scopesById.get(scope.parentScopeId);
    }
    return false;
};
/** Resolve one name starting from an explicitly selected lexical scope. */
export const resolveSemanticBindingFromScope = (scope, name, state) => {
    let candidate = scope;
    while (candidate !== undefined) {
        const binding = candidate.bindings.get(name);
        if (binding !== undefined)
            return binding;
        if (!candidate.bindingsComplete)
            return undefined;
        candidate =
            candidate.parentScopeId === null
                ? undefined
                : state.scopesById.get(candidate.parentScopeId);
    }
    return undefined;
};
/** Select the function/program owner for a var declaration. */
export const semanticVariableScope = (scope, parent, state) => {
    if (!(parent !== null && t.isVariableDeclaration(parent, { kind: "var" })))
        return scope;
    let candidate = scope;
    while (candidate.kind === "block" || candidate.kind === "catch") {
        const outer = candidate.parentScopeId === null
            ? undefined
            : state.scopesById.get(candidate.parentScopeId);
        if (outer === undefined)
            break;
        candidate = outer;
    }
    return candidate;
};
/** Identify a global name only when no lexical or dynamic environment shadows it. */
export const isUnshadowedGlobal = (node, state, name) => t.isIdentifier(node, { name }) &&
    resolveSemanticBindingState(state, node, name) === undefined &&
    !semanticResolutionBlocked(state, node, name);
