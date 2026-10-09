import { toolInputSchemaWithMetadata, toolOutputSchemaWithMetadata, } from "../contracts/toolSchemaMetadata.js";
/** Project the canonical Zod contracts directly into SDK registration. */
export const toolRegistrationOptions = (contract) => ({
    title: contract.title,
    description: contract.description,
    inputSchema: toolInputSchemaWithMetadata(contract),
    outputSchema: toolOutputSchemaWithMetadata(contract),
    annotations: contract.annotations,
});
