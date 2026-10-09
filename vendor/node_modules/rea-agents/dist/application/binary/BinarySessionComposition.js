import { InvestigationRecords } from "../investigation/InvestigationRecords.js";
import { AnalysisProviderRegistry } from "./AnalysisProviderRegistry.js";
import { BinarySession } from "./BinarySession.js";
import { SessionProviderRouter } from "./SessionProviderRouter.js";
/**
 * Compose one provider-neutral session from deep-provider selection and
 * disjoint auxiliary operation families.
 */
export const composeBinarySession = (registry, auxiliaryProviders = []) => new BinarySession(registry instanceof SessionProviderRouter
    ? registry
    : SessionProviderRouter.selectable(registry, auxiliaryProviders), new InvestigationRecords());
