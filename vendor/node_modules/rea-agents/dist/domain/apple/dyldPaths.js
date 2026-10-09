const MAX_SYMLINK_HOPS = 32;
/**
 * Resolve a root-relative path one segment at a time, as `open` would:
 * symlinks are followed inside the root, `..` applies to the real parent,
 * and any escape above the root or through an absolute link stops.
 */
export const resolveTreePath = async (view, input) => {
    const pending = segmentsOf(input);
    const resolved = [];
    let last;
    let hops = 0;
    while (pending.length > 0) {
        const segment = pending.shift() ?? "";
        if (segment === "..") {
            if (resolved.length === 0)
                return { kind: "escapes" };
            resolved.pop();
            last = { kind: "directory" };
            continue;
        }
        const path = [...resolved, segment].join("/");
        const entry = await view.entry(path);
        if (entry === undefined)
            return { kind: "absent" };
        if (entry.kind === "symlink") {
            hops += 1;
            if (hops > MAX_SYMLINK_HOPS)
                return { kind: "absent" };
            if (entry.target.startsWith("/"))
                return { kind: "escapes" };
            pending.unshift(...segmentsOf(entry.target));
            continue;
        }
        if (entry.kind === "file" && pending.length > 0)
            return { kind: "absent" };
        resolved.push(segment);
        last = entry;
    }
    return last?.kind === "file"
        ? { kind: "file", path: resolved.join("/") }
        : { kind: "not-file" };
};
const segmentsOf = (path) => path.split("/").filter((segment) => segment !== "" && segment !== ".");
export const directoryOf = (path) => {
    const index = path.lastIndexOf("/");
    return index < 0 ? "" : path.slice(0, index);
};
export const joinPath = (directory, rest) => directory === "" ? rest : rest === "" ? directory : `${directory}/${rest}`;
/** Expand one dyld path prefix relative to its owning image. */
export const expandPrefix = (raw, context) => {
    const variable = /^@(executable_path|loader_path)(?:\/(.*))?$/u.exec(raw);
    if (variable !== null) {
        const rest = variable[2] ?? "";
        if (variable[1] === "loader_path")
            return { scope: "target", path: joinPath(context.ownerDirectory, rest) };
        return context.executable === null
            ? { scope: "undetermined", path: raw }
            : {
                scope: "target",
                path: joinPath(directoryOf(context.executable), rest),
            };
    }
    if (raw.startsWith("/"))
        return { scope: "outside", path: raw };
    return { scope: "undetermined", path: raw };
};
/**
 * Slices a process may load, best first, following dyld's graded
 * architectures: an x86_64h process also accepts generic x86_64.
 */
const COMPATIBLE_ARCHITECTURES = {
    x86_64h: ["x86_64h", "x86_64"],
};
export const compatibleSlice = (slices, process) => {
    for (const architecture of COMPATIBLE_ARCHITECTURES[process] ?? [process]) {
        const slice = slices.find((item) => item.architecture === architecture);
        if (slice !== undefined)
            return slice;
    }
    return undefined;
};
