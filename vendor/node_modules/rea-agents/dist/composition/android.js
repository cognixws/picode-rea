import { JadxProvider } from "../android/JadxProvider.js";
/** Construct one APK provider with its own queue and cleanup-failure state. */
export const createAndroidAnalysisProvider = (environment = process.env, launcher) => new JadxProvider(environment, launcher);
