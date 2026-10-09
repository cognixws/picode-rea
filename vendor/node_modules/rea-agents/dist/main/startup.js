import { projectAnalysisError } from "../domain/analysisErrorProjection.js";
export const openInitialTarget = async (session, config, serverLogger, writeStderr) => {
    if (config.hopperTargetPath === undefined)
        return { ok: true };
    const opened = await session.open(config.hopperTargetPath, {
        targetKind: config.hopperTargetKind,
    });
    if (opened.ok)
        return { ok: true };
    await session.close();
    serverLogger.error({ errorTag: opened.error._tag }, "Initial target failed to open");
    writeStderr(`${projectAnalysisError(opened.error).message}\n`);
    return { ok: false, exitCode: 1 };
};
