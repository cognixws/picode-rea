import { z } from "zod";
const MAX_PLIST_DEPTH = 128;
/**
 * Project a decoded plist into JSON. Data and dates become explicit
 * `$plist_type` objects; a non-finite real becomes an explicit unknown
 * because the XML decoder reports NaN and ±infinity alike.
 */
export const projectPlistValue = (value) => {
    let unknownRealCount = 0;
    const project = (item, depth) => {
        if (depth > MAX_PLIST_DEPTH)
            throw new RangeError(`Plist exceeds ${String(MAX_PLIST_DEPTH)} nesting levels`);
        if (item instanceof Uint8Array)
            return {
                $plist_type: "data",
                base64: Buffer.from(item).toString("base64"),
            };
        if (item instanceof Date)
            return { $plist_type: "date", iso8601: item.toISOString() };
        if (typeof item === "number" && !Number.isFinite(item)) {
            unknownRealCount += 1;
            return { $plist_type: "real", value: null };
        }
        if (Array.isArray(item))
            return item.map((entry) => project(entry, depth + 1));
        if (item !== null && typeof item === "object")
            return Object.fromEntries(Object.entries(item).map(([key, entry]) => [
                key,
                project(entry, depth + 1),
            ]));
        return z.union([z.string(), z.number(), z.boolean(), z.null()]).parse(item);
    };
    const projected = project(value, 0);
    return { value: projected, unknownRealCount };
};
