import { PlaywrightElectronActiveProvider } from "../browser/PlaywrightElectronActiveProvider.js";
/** Construct a fresh provider without opening a target or acquiring an engine. */
export const createElectronScenarioProvider = () => new PlaywrightElectronActiveProvider();
