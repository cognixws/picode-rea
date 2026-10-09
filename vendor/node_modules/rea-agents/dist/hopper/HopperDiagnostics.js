/** Retain actionable ownership coordinates without exposing the run token. */
export const createOwnedHopperShutdownDiagnostic = (launch, stopped, cleanup) => ({
    type: "owned-shutdown",
    status: stopped.status,
    launcher_pid: launch.ownership?.leaderPid ?? launch.process.pid ?? null,
    process_group_id: launch.ownership?.processGroupId ?? null,
    cleanup_signaled: cleanup?.cleaned === true ? cleanup.signaled : null,
    reason: stopped.status === "incomplete" ? stopped.reason : null,
});
/** Convert an unexpected cleanup rejection without exposing a stack or token. */
export const providerCleanupFailure = (_cause) => ({
    cleaned: false,
    reason: "owned provider cleanup failed",
});
