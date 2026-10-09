/** Caller-visible operational state for one provider bridge. */
export const PROVIDER_OPERATION_STATES = [
    "idle",
    "busy",
    "exited",
    "unreachable",
    "not_started",
    "unknown",
];
/** What the caller should do next for this provider state. */
export const PROVIDER_RETRY_ACTIONS = [
    "retry",
    "wait",
    "restart_provider",
    "unknown",
];
/** Stage that was in progress when the provider operation failed. */
export const PROVIDER_FAILURE_STAGES = [
    "launch",
    "connection",
    "analysis",
    "decompilation",
    "unknown",
];
/**
 * Choose a recovery action from the observed state.
 * Startup failures keep their existing install or configuration guidance.
 */
export const providerRetryAction = (state, startupFailure = false) => {
    if (state === "idle")
        return null;
    if (startupFailure && state === "exited")
        return "retry";
    switch (state) {
        case "busy":
            return "wait";
        case "exited":
        case "unreachable":
            return "restart_provider";
        case "not_started":
            return "retry";
        case "unknown":
            return "unknown";
    }
};
/** Use one stage when every retained request agrees, otherwise unknown. */
export const sharedProviderFailureStage = (requests) => {
    const first = requests[0]?.stage;
    if (first === undefined)
        return null;
    return requests.every((request) => request.stage === first)
        ? first
        : "unknown";
};
