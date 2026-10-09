import { createAndroidAnalysisProvider } from "../composition/android.js";
import { createServer } from "../server/createServer.js";
import { MCP_CONNECTION_LOST, MCP_CONNECTION_START_FAILED, } from "./messages.js";
export const startMcpTransport = async (dependencies, session, serverContext) => {
    const { serverLogger } = serverContext;
    let optionalProviders = {};
    try {
        optionalProviders = await serverContext.loadOptionalProviders();
    }
    catch (cause) {
        serverLogger.warn({
            error: cause instanceof Error ? cause.message : String(cause),
        }, "Optional MCP providers could not load; affected tools remain unavailable");
    }
    for (const failure of Object.values(optionalProviders.optionalProviderLoadFailures ?? {})) {
        serverLogger.warn({ providerId: failure.providerId, error: failure.reason }, "Optional MCP adapter could not load; its peers remain available");
    }
    const androidProviders = [];
    const closeAndroid = async () => {
        const results = await Promise.allSettled(androidProviders.map((provider) => provider.close()));
        for (const result of results)
            if (result.status === "rejected")
                throw result.reason;
    };
    let handle;
    try {
        handle = dependencies.serve(() => {
            // The SDK can discard a discovery probe and construct a replacement server.
            const android = createAndroidAnalysisProvider(dependencies.env);
            androidProviders.push(android);
            return (dependencies.createServer ?? createServer)(session, session, {
                logger: serverContext.logger,
                ...optionalProviders,
                androidAnalysis: android,
            });
        }, {
            onerror: () => {
                serverLogger.error(MCP_CONNECTION_LOST);
                dependencies.writeStderr(`${MCP_CONNECTION_LOST}\n`);
            },
        });
    }
    catch (cause) {
        await Promise.allSettled([session.close(), closeAndroid()]);
        serverLogger.error({
            error: cause instanceof Error ? cause.message : String(cause),
        }, MCP_CONNECTION_START_FAILED);
        dependencies.writeStderr(`${MCP_CONNECTION_START_FAILED}\n`);
        return { ok: false };
    }
    return { ok: true, handle, closeAndroid };
};
