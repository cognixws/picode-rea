import { createBrowserObservationProvider } from "./composition/browserObservation.js";
import { projectAnalysisError } from "./domain/analysisErrorProjection.js";
/** Build the passive browser provider; scope is supplied on each request. */
export const browserContext = () => ({
    provider: createBrowserObservationProvider(),
});
/** Project a browser operation failure consistently across CLI command groups. */
export const browserCliError = (error) => ({
    error: "Browser observation failed",
    ...projectAnalysisError(error),
});
