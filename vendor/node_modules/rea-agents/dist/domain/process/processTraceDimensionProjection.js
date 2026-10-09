/** Map declared trace sources to legacy process-comparison dimensions. */
export const dimensionsForTraceSources = (sources) => {
    const dimensions = new Set();
    for (const source of sources) {
        if (source.startsWith("terminal_"))
            dimensions.add("terminal");
        else if (source === "interaction")
            dimensions.add("interaction");
        else if (source === "lifecycle")
            dimensions.add("exit");
        else if (source === "filesystem")
            dimensions.add("filesystem");
        else if (source === "process")
            dimensions.add("process");
    }
    return dimensions;
};
/** Whether a trace specification covers every observed source in a dimension. */
export const traceCoversObservedDimension = (dimension, sources, left, right) => {
    const any = (leftValues, rightValues) => leftValues.length > 0 || rightValues.length > 0;
    switch (dimension) {
        case "terminal":
            return ((!any(left.frames, right.frames) || sources.has("terminal_raw")) &&
                (!any(left.rendered_frames, right.rendered_frames) ||
                    sources.has("terminal_rendered")));
        case "interaction":
            return sources.has("interaction");
        case "exit":
            return sources.has("lifecycle");
        case "filesystem":
            return false;
        case "process":
            return sources.has("process");
    }
};
