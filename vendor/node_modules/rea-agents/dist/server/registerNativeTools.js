import { NATIVE_TOOL_CONTRACTS } from "../contracts/native/nativeToolContracts.js";
import { registerEvidenceTools } from "./registerEvidenceTools.js";
/** Register provider-neutral static inspection operations. */
export const registerNativeTools = (server, analysis, options) => {
    registerEvidenceTools(server, analysis, NATIVE_TOOL_CONTRACTS, options);
};
