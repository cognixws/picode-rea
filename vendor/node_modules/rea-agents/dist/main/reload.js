import { parseConfig } from "../config.js";
export const registerConfigReload = (input) => {
    const { dependencies, runtimeState, serverLogger } = input;
    return (dependencies.registerReload?.(() => {
        const refreshed = parseConfig(dependencies.env);
        if (!refreshed.ok) {
            serverLogger.error("Reloaded REA configuration is invalid");
            return;
        }
        runtimeState.currentConfig = refreshed.value;
    }) ?? (() => undefined));
};
