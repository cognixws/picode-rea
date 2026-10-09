import { ProviderCleanupError } from "../../domain/providerCleanupError.js";
import { err, ok } from "../../domain/result.js";
/** Close one provider client and normalize unexpected adapter rejection. */
export const closeAnalysisClient = async (client, providerId, options = {}) => {
    try {
        if (client.closeWithOutcome !== undefined)
            return await client.closeWithOutcome(options);
        await client.close();
        return ok(null);
    }
    catch (cause) {
        return err(new ProviderCleanupError(providerId, ["provider-client"], { reason: "provider client close rejected unexpectedly" }, { cause }));
    }
};
