import { createJavaScriptRuntimeObservationEvidence } from "./JavaScriptRuntimeObservationEvidence.js";
import { AnalysisCancelledError, AnalysisCapabilityUnavailableError, } from "../../domain/analysisErrorCore.js";
import {} from "../../domain/analysisErrorBase.js";
import { err, ok } from "../../domain/result.js";
/** List targets exposed by the explicitly selected loopback Inspector. */
export const listJavaScriptRuntimeTargets = async (provider, input, options = {}) => {
    const ready = requireProvider(provider, "list_javascript_runtime_targets");
    if (!ready.ok)
        return ready;
    const result = await ready.value.listTargets(input, options);
    return result.ok
        ? ok(createJavaScriptRuntimeObservationEvidence("list_javascript_runtime_targets", input, result.value, ready.value.identity()))
        : result;
};
/** Observe one attach-only Inspector target selected by the request. */
export const observeJavaScriptRuntime = async (provider, input, options = {}) => {
    const ready = requireProvider(provider, "observe_javascript_runtime");
    if (!ready.ok)
        return ready;
    const result = await ready.value.observe(input, options);
    if (options.signal?.aborted === true)
        return err(new AnalysisCancelledError("observe_javascript_runtime"));
    return result.ok
        ? ok(createJavaScriptRuntimeObservationEvidence("observe_javascript_runtime", input, result.value, ready.value.identity()))
        : result;
};
const requireProvider = (provider, operation) => provider === undefined
    ? err(new AnalysisCapabilityUnavailableError("rea-v8-inspector", operation, "V8 Inspector observation provider is not configured"))
    : ok(provider);
