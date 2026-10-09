import { collectJavaScriptSemanticAsyncEffects } from "./javascriptSemanticAsyncEffects.js";
import { collectJavaScriptSemanticCalls } from "./javascriptSemanticCalls.js";
import { collectJavaScriptSemanticChildProcesses } from "./javascriptSemanticChildProcesses.js";
import { collectJavaScriptSemanticFingerprints } from "./javascriptSemanticFingerprints.js";
import { collectJavaScriptSemanticDataEffects } from "./javascriptSemanticDataEffects.js";
import { collectJavaScriptSemanticPromises } from "./javascriptSemanticPromises.js";
import { collectJavaScriptSemanticObjects } from "./javascriptSemanticObjects.js";
import { collectJavaScriptSemanticResources } from "./javascriptSemanticResources.js";
/** Compose bounded semantic passes after lexical definitions are available. */
export const collectJavaScriptDerivedSemantics = (program, state, callables, parserPartial) => {
    const calls = collectJavaScriptSemanticCalls(program, state, callables);
    const promiseOperations = collectJavaScriptSemanticPromises(program, state, callables);
    const asyncEffects = collectJavaScriptSemanticAsyncEffects(program, state, callables);
    const childProcesses = collectJavaScriptSemanticChildProcesses(program, state, callables);
    const dataEffects = collectJavaScriptSemanticDataEffects(program, state, callables);
    const resourceOperations = collectJavaScriptSemanticResources(program, state, callables);
    const objectOperations = collectJavaScriptSemanticObjects(program, state, callables);
    const functionFingerprints = collectJavaScriptSemanticFingerprints({
        state,
        callables,
        calls,
        promises: promiseOperations,
        events: asyncEffects.eventOperations,
        timers: asyncEffects.timerOperations,
        childProcessSpawns: childProcesses.childProcessSpawns,
        childProcessInteractions: childProcesses.childProcessInteractions,
        requestOperations: dataEffects.requestOperations,
        resourceOperations,
        parserPartial,
    });
    return {
        ...calls,
        promiseOperations,
        ...asyncEffects,
        ...childProcesses,
        ...dataEffects,
        resourceOperations,
        objectOperations,
        functionFingerprints,
    };
};
