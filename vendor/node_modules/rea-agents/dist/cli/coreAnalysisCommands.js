import { registerCoreBinaryCommands } from "./coreBinaryCommands.js";
import { registerCoreNativeCommands } from "./coreNativeCommands.js";
/** Register core binary and native deep-analysis CLI commands. */
export const registerCoreAnalysisCommands = (cli, logger, resultOutput) => {
    registerCoreBinaryCommands(cli, logger, resultOutput);
    registerCoreNativeCommands(cli, logger);
};
