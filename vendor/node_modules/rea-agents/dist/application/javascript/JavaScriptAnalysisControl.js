import { setImmediate } from "node:timers/promises";
import { ArtifactReaderFailure } from "../../artifacts/ArtifactReader.js";
/** Reject cancelled application work before computing or publishing more results. */
export const assertJavaScriptAnalysisActive = (signal) => {
    if (signal?.aborted === true)
        throw new ArtifactReaderFailure("cancelled", "JavaScript application analysis cancelled");
};
/** Let request control messages run, then recheck the current analysis intent. */
export const checkpointJavaScriptAnalysis = async (signal) => {
    assertJavaScriptAnalysisActive(signal);
    await setImmediate();
    assertJavaScriptAnalysisActive(signal);
};
/** Drive bounded owned-domain steps while permitting cancellation and control I/O. */
export const completeJavaScriptAnalysisSteps = async (steps, signal) => {
    let deadline = performance.now() + 8;
    try {
        for (;;) {
            assertJavaScriptAnalysisActive(signal);
            const step = steps.next();
            if (step.done) {
                assertJavaScriptAnalysisActive(signal);
                return step.value;
            }
            if (performance.now() >= deadline) {
                await checkpointJavaScriptAnalysis(signal);
                deadline = performance.now() + 8;
            }
        }
    }
    finally {
        steps.return?.();
    }
};
