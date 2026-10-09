import { ArtifactOperationError } from "./artifactOperationError.js";
/** Publication failure retaining its input/output target and cleanup state. */
export class WebScriptExportError extends ArtifactOperationError {
    userMessage;
    cleanupIncomplete;
    cleanupResources;
    constructor(reason, target, diagnostic, residualPaths = []) {
        super("export_web_scripts", reason);
        this.userMessage = `Script export failed for ${target}: ${diagnostic}`;
        this.cleanupResources = residualPaths;
        this.cleanupIncomplete = residualPaths.length > 0;
    }
}
