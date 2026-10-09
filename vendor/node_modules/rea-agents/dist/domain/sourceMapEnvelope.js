const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
/** Whether a parsed value has the version-3 map shape. */
export const isVersion3Map = (value) => isRecord(value) && value.version === 3;
const isValidOffset = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
/**
 * Collect leaf maps from an indexed source-map envelope, or undefined when
 * the envelope is not a version-3 map. A map carrying neither `mappings`
 * nor `sections` yields itself as the single leaf; callers decide whether
 * that leaf is valid content.
 */
export const flattenSourceMapLeaves = (root, options) => {
    if (!isVersion3Map(root))
        return undefined;
    const leaves = [];
    const pending = [root];
    while (pending.length > 0) {
        const map = pending.pop();
        if (!isVersion3Map(map))
            return undefined;
        if (Array.isArray(map.sections)) {
            for (const section of map.sections) {
                if (!isRecord(section) || !isRecord(section.map))
                    return undefined;
                if (options?.validateOffsets === true) {
                    if (!isRecord(section.offset))
                        return undefined;
                    if (!isValidOffset(section.offset.line) ||
                        !isValidOffset(section.offset.column))
                        return undefined;
                }
                pending.push(section.map);
            }
        }
        else
            leaves.push(map);
    }
    return leaves;
};
