/** Create a monotonic, rate-bounded reporter around a surface-specific sink. */
export const createProgressReporter = (sink, options = {}) => {
    const minimumIntervalMs = options.minimumIntervalMs ?? 100;
    const now = options.now ?? Date.now;
    let lastCompleted = -1;
    let lastSentAt = Number.NEGATIVE_INFINITY;
    let sequence = 0;
    return {
        async report(update) {
            if (!Number.isFinite(update.completed) || update.completed < 0)
                throw new TypeError("Progress completed must be a nonnegative number");
            if (update.total !== null && update.total < update.completed)
                throw new TypeError("Progress total cannot be less than completed");
            if (update.completed < lastCompleted)
                throw new TypeError("Progress cannot move backwards");
            lastCompleted = update.completed;
            const observedAt = now();
            if (update.terminal !== true &&
                observedAt - lastSentAt < minimumIntervalMs)
                return;
            lastSentAt = observedAt;
            sequence += 1;
            await sink({ ...update, sequence });
        },
    };
};
/** Surface that deliberately ignores progress while preserving one workflow API. */
export const silentProgressReporter = {
    report: () => Promise.resolve(),
};
