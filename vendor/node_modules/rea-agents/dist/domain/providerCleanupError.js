import { ProviderAdapterError } from "./providerAdapterError.js";
/** Provider resources could not be proven closed after bounded cleanup. */
export class ProviderCleanupError extends ProviderAdapterError {
    cleanupIncomplete = true;
    cleanupResources;
    userMessage = "Provider cleanup could not be fully confirmed. Review the reported local resources before opening another target.";
    constructor(providerId, resources, diagnostics, 
    /** Identify the operation owning these resources; binary callers retain their default. */
    options) {
        const { operation = "close_binary", ...errorOptions } = options ?? {};
        super(providerId, operation, { ...errorOptions, diagnostics });
        this.cleanupResources = [...resources];
    }
}
