import { CdpCaptureCompleteness } from "./CdpCaptureCompleteness.js";
import { numberValue, recordValue, cdpStringValue, } from "./CdpCaptureValues.js";
/** Retain script/frame metadata from passive Electron events. */
export const ingestElectronScriptEvent = (input) => {
    if (input.event.method === "Runtime.executionContextsCleared") {
        input.executionContextFrames.clear();
        return;
    }
    if (input.event.method === "Runtime.executionContextDestroyed") {
        const parameters = recordValue(input.event.params);
        const key = executionContextKey(parameters?.executionContextId);
        if (key !== null)
            input.executionContextFrames.delete(key);
        return;
    }
    if (input.event.method === "Runtime.executionContextCreated") {
        retainExecutionContext(input.event, input.executionContextFrames);
        return;
    }
    if (input.event.method !== "Debugger.scriptParsed")
        return;
    const value = recordValue(input.event.params);
    const scriptId = cdpStringValue(value?.scriptId);
    const rawUrl = cdpStringValue(value?.url);
    if (scriptId === undefined) {
        input.completeness.exclude("scripts", "invalid_protocol_value");
        return;
    }
    if (rawUrl === undefined || rawUrl === "") {
        input.completeness.exclude("scripts", "unattributed_origin");
        return;
    }
    input.scripts.push({
        scriptId,
        rawUrl,
        hash: cdpStringValue(value?.hash) ?? "",
        length: nonnegativeInteger(value?.length),
        isModule: value?.isModule === true,
        language: cdpStringValue(value?.scriptLanguage) ?? null,
        executionContextKey: executionContextKey(value?.executionContextId),
    });
};
const retainExecutionContext = (event, frames) => {
    const parameters = recordValue(event.params);
    const runtimeContext = recordValue(parameters?.context);
    const contextKey = executionContextKey(runtimeContext?.id);
    const frameId = cdpStringValue(recordValue(runtimeContext?.auxData)?.frameId);
    if (contextKey === null || frameId === undefined)
        return;
    frames.set(contextKey, frameId);
};
const nonnegativeInteger = (value) => {
    const number = numberValue(value);
    return number === undefined ? 0 : Math.max(0, Math.trunc(number));
};
const executionContextKey = (value) => {
    const identifier = numberValue(value);
    return identifier !== undefined && Number.isSafeInteger(identifier)
        ? String(identifier)
        : null;
};
