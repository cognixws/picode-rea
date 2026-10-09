import { JavaScriptModuleRangeIndex } from "./javascriptStaticAnalysisFindings.js";
/** Create isolated mutable state for one source analysis. */
export const createJavaScriptAnalysisAccumulator = (sourceLength) => ({
    references: [],
    endpoints: [],
    storage: [],
    roles: [],
    sourceMaps: [],
    registrations: [],
    browserWindows: [],
    contextBridgeApis: [],
    ipc: [],
    senderValidations: [],
    utilityProcesses: [],
    nativeAddonBindings: [],
    moduleRangeIndex: new JavaScriptModuleRangeIndex(sourceLength),
    seen: new Set(),
    visitedNodes: 0,
    unknownFindings: 0,
});
