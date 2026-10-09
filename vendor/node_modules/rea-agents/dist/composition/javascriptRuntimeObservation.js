import { V8InspectorProvider } from "../inspector/V8InspectorProvider.js";
/** Construct a fresh provider without opening a target or acquiring an engine. */
export const createJavaScriptRuntimeObservationProvider = () => new V8InspectorProvider();
