/** Whether the requested setup actions still need approval or human repair. */
export const isSetupFailure = (result) => {
    const status = result.status;
    switch (status) {
        case "planned":
        case "cancelled":
        case "ready":
            return false;
        case "needs_confirmation":
        case "needs_human":
            return true;
        default: {
            const exhaustive = status;
            throw new TypeError(`Unhandled setup result status: ${String(exhaustive)}`);
        }
    }
};
