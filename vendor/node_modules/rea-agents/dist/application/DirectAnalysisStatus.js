import { parseConfig } from "../config.js";
import { projectAnalysisError } from "../domain/analysisErrorProjection.js";
import { jsonObjectSchema } from "../domain/jsonValue.js";
import { createServerIdentity } from "../serverIdentity.js";
import { silentLogger } from "../logger.js";
const runSessionStatus = async (dependencies, logger = silentLogger, environment = process.env) => {
    const config = parseConfig(environment);
    if (!config.ok)
        return { error: projectAnalysisError(config.error) };
    const session = dependencies.createBinarySession(config.value, logger);
    try {
        return {
            ...jsonObjectSchema.parse(session.status()),
            server_identity: createServerIdentity({
                startedAt: new Date().toISOString(),
            }),
        };
    }
    finally {
        await session.close();
    }
};
/** List binary-session provider candidates and auxiliary operation availability. */
export const runProviderStatus = (dependencies, logger = silentLogger, environment = process.env) => runSessionStatus(dependencies, logger, environment);
/** List binary-session operation descriptors; this is not the full MCP catalog. */
export const runCapabilityStatus = (dependencies, logger = silentLogger, environment = process.env) => runSessionStatus(dependencies, logger, environment);
