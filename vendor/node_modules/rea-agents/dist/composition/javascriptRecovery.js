import { WakaruProvider } from "../javascript/recovery/WakaruProvider.js";
/** Construct optional recovery without acquiring tools, processes or workspaces. */
export const createJavaScriptRecoveryProvider = (environment = process.env, launcher) => new WakaruProvider(environment, launcher);
