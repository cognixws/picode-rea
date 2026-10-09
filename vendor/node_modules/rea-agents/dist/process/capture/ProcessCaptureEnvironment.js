/** Build the child environment from the host plus caller-selected overrides. */
export const makeProcessCaptureEnvironment = (options) => ({
    ...Object.fromEntries(Object.entries(options.hostEnvironment).filter((entry) => entry[1] !== undefined)),
    ...options.scenario.environment,
    TERM: options.scenario.environment.TERM ??
        options.hostEnvironment.TERM ??
        "xterm-256color",
    REA_PROCESS_RUN_ID: options.runId,
});
