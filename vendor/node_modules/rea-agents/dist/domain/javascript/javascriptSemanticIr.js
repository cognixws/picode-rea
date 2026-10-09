/** Find the innermost resolved reference at one source coordinate. */
export const semanticReferenceAt = (ir, line, column) => ir.references.find(({ location }) => location.start.line === line && location.start.column === column);
/** Read one binding by its deterministic semantic identifier. */
export const semanticBinding = (ir, bindingId) => ir.bindings.find(({ bindingId: candidate }) => candidate === bindingId);
/** Fail-closed result when Babel cannot produce an inert syntax tree. */
export const failedJavaScriptSemanticIr = () => ({
    schema: "JavaScriptSemanticIR",
    scopes: [],
    bindings: [],
    callables: [],
    references: [],
    moduleLinks: [],
    callSites: [],
    argumentFlows: [],
    callReturnFlows: [],
    callResultFlows: [],
    closureCaptures: [],
    promiseOperations: [],
    eventOperations: [],
    timerOperations: [],
    childProcessSpawns: [],
    childProcessInteractions: [],
    configurationOperations: [],
    requestOperations: [],
    boundaryOperations: [],
    resourceOperations: [],
    objectOperations: [],
    functionFingerprints: [],
    frontiers: [],
    coverage: { status: "failed", omittedCount: null },
    limitations: [
        "JavaScript parsing failed; no semantic absence claim is available.",
        "No JavaScript was executed.",
    ],
});
