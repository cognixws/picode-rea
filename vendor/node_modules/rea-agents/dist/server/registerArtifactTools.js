import { ARTIFACT_TOOL_CONTRACTS } from "../contracts/artifactToolContracts.js";
import { registerEvidenceTools } from "./registerEvidenceTools.js";
import { artifactInspectionResultSchema } from "../domain/artifactInspection.js";
/** Register deterministic artifact inventory and safe extraction operations. */
export const registerArtifactTools = (server, analysis, options) => {
    registerEvidenceTools(server, analysis, ARTIFACT_TOOL_CONTRACTS, {
        ...options,
        sourceEvidence: (operation, result) => operation === "inspect_artifact"
            ? artifactInspectionResultSchema
                .parse(result)
                .substeps.map(({ evidence }) => evidence)
            : [],
    });
};
