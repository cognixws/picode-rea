import { z } from "zod";
import { jsonValueSchema } from "../domain/jsonValue.js";
import { err, ok } from "../domain/result.js";
const responseSchema = z.discriminatedUnion("ok", [
    z.strictObject({
        id: z.number().int().positive(),
        ok: z.literal(true),
        result: jsonValueSchema,
    }),
    z.strictObject({
        id: z.number().int().positive(),
        ok: z.literal(false),
        error: z
            .object({
            code: z.string().min(1),
            message: z.string().min(1),
        })
            .strict(),
    }),
]);
/** Expected operation failure returned by the authenticated Java bridge. */
export class GhidraRemoteError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "GhidraRemoteError";
    }
}
/** Parse one complete Java-bridge response without accepting extra fields. */
export const parseGhidraResponseLine = (line) => {
    try {
        const parsed = JSON.parse(line);
        const response = responseSchema.safeParse(parsed);
        return response.success
            ? ok(response.data)
            : err(new Error("Ghidra bridge response has an invalid shape"));
    }
    catch (cause) {
        return err(new Error("Ghidra bridge response is not valid JSON", { cause }));
    }
};
/** Project one validated response into its result or remote failure. */
export const ghidraResponseResult = (response) => response.ok
    ? ok(response.result)
    : err(new GhidraRemoteError(response.error.code, response.error.message));
