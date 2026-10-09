import { z } from "zod";
import { ConfigurationError } from "../domain/configurationErrors.js";
import { err, ok } from "../domain/result.js";
export const parseStringArray = (encoded, name) => {
    try {
        const parsed = z.array(z.string().min(1)).safeParse(JSON.parse(encoded));
        return parsed.success
            ? ok(parsed.data)
            : err(new ConfigurationError(`${name} must encode an array of strings`, {
                cause: parsed.error,
            }));
    }
    catch (cause) {
        return err(new ConfigurationError(`${name} must be valid JSON`, { cause }));
    }
};
export const parseLoaderArgs = (encoded) => {
    if (encoded === undefined)
        return ok([]);
    let decoded;
    try {
        decoded = JSON.parse(encoded);
    }
    catch (cause) {
        return err(new ConfigurationError("HOPPER_LOADER_ARGS_JSON must be valid JSON", {
            cause,
        }));
    }
    const parsed = z.array(z.string()).safeParse(decoded);
    return parsed.success
        ? ok(parsed.data)
        : err(new ConfigurationError("HOPPER_LOADER_ARGS_JSON must encode an array of strings", { cause: parsed.error }));
};
