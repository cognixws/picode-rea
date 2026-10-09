import { PlaywrightBrowserScenarioProvider } from "../browser/PlaywrightBrowserScenarioProvider.js";
/** Construct a fresh provider without opening a target or acquiring an engine. */
export const createBrowserScenarioProvider = () => new PlaywrightBrowserScenarioProvider();
