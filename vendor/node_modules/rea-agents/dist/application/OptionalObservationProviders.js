import { AnalysisCapabilityUnavailableError } from "../domain/analysisErrorCore.js";
/** Preserve the module's failure reason through the existing tool error algebra. */
export const optionalProviderUnavailable = (failure, operation) => new AnalysisCapabilityUnavailableError(failure.providerId, operation, `Adapter could not load: ${failure.reason}`);
