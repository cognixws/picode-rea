import { redactExplicitText } from "./explicitSensitiveValues.js";
/** Exclude marked source coordinates without inventing a substitute record identity. */
export const excludeCaptureCoordinates = (value, sensitiveValues) => {
    if (sensitiveValues.length === 0)
        return value;
    let excluded = false;
    const sensitive = (pointer) => sensitiveValues.some((literal) => pointer.includes(literal));
    const sidecars = (items) => items.filter((item) => {
        if (!sensitive(item.pointer))
            return true;
        excluded = true;
        return false;
    });
    const records = value.records.map((record) => {
        const location = (record.location.kind === "json-pointer" &&
            sensitive(record.location.pointer)) ||
            (record.location.kind === "byte-range" &&
                (sensitive(String(record.location.offset)) ||
                    sensitive(String(record.location.bytes))))
            ? {
                kind: "unknown",
                reason: "explicit-sensitive-value",
            }
            : record.location;
        if (location !== record.location)
            excluded = true;
        return {
            ...record,
            location,
            binary_fields: sidecars(record.binary_fields),
            numeric_literals: sidecars(record.numeric_literals),
            redactions: sidecars(record.redactions),
        };
    });
    const recordsPointer = value.container.records_pointer;
    const records_pointer = recordsPointer !== null && sensitive(recordsPointer)
        ? null
        : recordsPointer;
    if (records_pointer !== recordsPointer)
        excluded = true;
    const container = {
        ...value.container,
        records_pointer,
        numeric_literals: sidecars(value.container.numeric_literals),
        redactions: sidecars(value.container.redactions),
    };
    return {
        ...value,
        container,
        records,
        limitations: excluded
            ? [
                ...value.limitations,
                redactExplicitText("Marked source coordinates and their sidecars are excluded; affected record locations remain unknown.", sensitiveValues),
            ]
            : value.limitations,
    };
};
