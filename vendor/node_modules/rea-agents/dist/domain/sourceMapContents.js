/** Validate optional source-map content against its source inventory. */
export const hasValidSourceMapContents = (sourceCount, contents) => contents === undefined ||
    (Array.isArray(contents) &&
        contents.length === sourceCount &&
        contents.every((content) => content === null || typeof content === "string"));
