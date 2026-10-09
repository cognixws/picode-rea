import { registerTraceFeatureTool } from "./registerApplicationTools/traceFeature.js";
import { registerTraceJavaScriptSemanticsTool } from "./registerApplicationTools/traceSemantics.js";
import { registerCompareApplicationVersionsTool } from "./registerApplicationTools/compareVersions.js";
import { registerCompareSourceToBundleTool } from "./registerApplicationTools/compareSourceToBundle.js";
import { registerCompareJavaScriptExportShapesTool } from "./registerApplicationTools/compareExportShapes.js";
import { registerCoverageTools } from "./registerApplicationTools/coverage.js";
import { registerReconstructionObligationLedgerTool } from "./registerApplicationTools/obligationLedger.js";
import { registerProjectMobileApplicationGraphTools } from "./registerApplicationTools/projectMobileApplicationGraph.js";
/** Register provider-neutral JavaScript application graph workflows. */
export const registerApplicationTools = (server, options) => {
    registerTraceFeatureTool(server, options);
    registerTraceJavaScriptSemanticsTool(server, options);
    registerCompareApplicationVersionsTool(server, options);
    registerCompareSourceToBundleTool(server, options);
    registerCompareJavaScriptExportShapesTool(server, options);
    registerReconstructionObligationLedgerTool(server, options);
    registerCoverageTools(server, options);
    registerProjectMobileApplicationGraphTools(server, options);
};
