import { createProgressReporter, silentProgressReporter, } from "../application/ProgressReporter.js";
/** Adapt the request's negotiated MCP progress token to application progress. */
export const mcpProgressReporter = (context) => {
    const token = context.mcpReq._meta?.progressToken;
    if (token === undefined)
        return silentProgressReporter;
    return createProgressReporter(async (update) => {
        try {
            await context.mcpReq.notify({
                method: "notifications/progress",
                params: {
                    progressToken: token,
                    progress: update.completed,
                    ...(update.total === null ? {} : { total: update.total }),
                    message: `${update.phase}: ${update.message}`,
                },
            });
        }
        catch (cause) {
            // Progress is observational; transport failure cannot change tool truth.
            void cause;
        }
    }, { minimumIntervalMs: 100 });
};
