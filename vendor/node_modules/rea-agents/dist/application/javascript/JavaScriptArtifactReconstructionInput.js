import { z } from "zod";
/** Local ASAR/directory reconstruction request. */
export const javascriptArtifactReconstructionInputSchema = z.strictObject({
    input_path: z.string().min(1),
    format: z.enum(["auto", "asar", "directory"]).default("auto"),
});
