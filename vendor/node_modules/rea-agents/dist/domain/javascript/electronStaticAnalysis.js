import { inspectElectronBrowserNode } from "./electronStaticAnalysisBrowser.js";
import { inspectElectronIpcNode } from "./electronStaticAnalysisIpc.js";
import { inspectElectronNativeNode } from "./electronStaticAnalysisNative.js";
/** Collect Electron-specific syntax during the shared inert AST traversal. */
export const inspectElectronStaticNode = (node, context) => {
    inspectElectronBrowserNode(node, context);
    inspectElectronIpcNode(node, context);
    inspectElectronNativeNode(node, context);
};
