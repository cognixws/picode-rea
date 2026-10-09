import { registerCompareManagedMembers } from "./registerManagedWorkflowTools/compareManagedMembers.js";
import { registerVerifyManagedNativeBoundaries } from "./registerManagedWorkflowTools/verifyManagedNativeBoundaries.js";
import { registerImportManagedReconstruction } from "./registerManagedWorkflowTools/importManagedReconstruction.js";
import { registerProjectManagedApplicationGraph } from "./registerManagedWorkflowTools/projectManagedApplicationGraph.js";
/** Register provider-neutral managed-code workflows. */
export const registerManagedWorkflowTools = (server, options) => {
    registerCompareManagedMembers(server, options);
    registerVerifyManagedNativeBoundaries(server, options);
    registerImportManagedReconstruction(server, options);
    registerProjectManagedApplicationGraph(server, options);
};
