import { executableFormatHintSchema, } from "../domain/dosCom.js";
import { analysisProviderSelectorSchema } from "../contracts/providerSelection.js";
export const providerSelectionOption = analysisProviderSelectorSchema
    .optional()
    .describe("Bind deep analysis to a provider ID or use deterministic auto selection");
/** Explicit interpretation for headerless native executable formats. */
export const formatSelectionOption = executableFormatHintSchema
    .optional()
    .describe("Explicit headerless DOS COM interpretation");
export const directAnalysisOptions = (logger, snapshotPath, providerId, formatHint) => ({
    logger,
    snapshotPath,
    ...(formatHint === undefined ? {} : { formatHint }),
    ...(providerId === undefined ? {} : { providerId }),
});
