/** Report one lifecycle operation start through the shared monotonic boundary. */
export const reportLifecycleStart = (progress, phase, message = "started") => progress.report({ phase, completed: 0, total: 1, message });
/** Report one lifecycle operation's terminal disposition. */
export const reportLifecycleEnd = (progress, phase, succeeded) => progress.report({
    phase,
    completed: 1,
    total: 1,
    message: succeeded ? "completed" : "failed",
    terminal: true,
});
