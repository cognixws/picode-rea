import { FirmwareProvider } from "../firmware/FirmwareProvider.js";
/** Construct one firmware provider without launching or acquiring an engine. */
export const createFirmwareAnalysisProvider = (environment = process.env, launcher) => new FirmwareProvider(environment, launcher);
