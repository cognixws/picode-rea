import { AnalysisCancelledError, AnalysisTimeoutError, } from "../domain/analysisErrorCore.js";
const OPERATION = "capture_browser_scenario";
export const withPlaywrightExecutionBoundary = (work, timeoutMs, signal) => {
    if (timeoutMs !== undefined && timeoutMs <= 0)
        return Promise.reject(new AnalysisTimeoutError(OPERATION, timeoutMs));
    if (signal?.aborted === true)
        return Promise.reject(new AnalysisCancelledError(OPERATION));
    return new Promise((resolve, reject) => {
        let settled = false;
        let timer;
        const deadline = timeoutMs === undefined ? undefined : Date.now() + timeoutMs;
        const scheduleTimeout = () => {
            if (deadline === undefined)
                return;
            const remaining = deadline - Date.now();
            if (remaining <= 0) {
                fail(new AnalysisTimeoutError(OPERATION, timeoutMs ?? 0));
                return;
            }
            timer = setTimeout(scheduleTimeout, Math.min(remaining, 2_147_483_647));
            timer.unref();
        };
        const cleanup = () => {
            if (timer !== undefined)
                clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
        };
        const succeed = (value) => {
            if (settled)
                return;
            settled = true;
            cleanup();
            resolve(value);
        };
        const fail = (error) => {
            if (settled)
                return;
            settled = true;
            cleanup();
            reject(error);
        };
        const onAbort = () => {
            fail(new AnalysisCancelledError(OPERATION));
        };
        scheduleTimeout();
        signal?.addEventListener("abort", onAbort, { once: true });
        if (signal?.aborted === true) {
            onAbort();
            return;
        }
        void work().then(succeed, fail);
    });
};
