import {} from "./ReferenceSourceReaderTypes.js";
export const failure = (code, message) => ({
    tag: "reference-source-reader",
    code,
    message,
});
export const cancelled = () => failure("cancelled", "Reference source traversal cancelled");
export const safeSize = (size) => {
    const value = Number(size);
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
};
const FILESYSTEM_ERROR_CODES = new Set([
    "EACCES",
    "EBADF",
    "EEXIST",
    "EIO",
    "EISDIR",
    "ELOOP",
    "EMFILE",
    "ENFILE",
    "ENOENT",
    "ENOTDIR",
    "ENOSPC",
    "EPERM",
    "EROFS",
]);
/** Preserve actionable operating-system detail while leaving invariants visible. */
export const filesystemFailureDetail = (cause, operation) => {
    if (!(cause instanceof Error))
        return undefined;
    const code = Reflect.get(cause, "code");
    return typeof code === "string" && FILESYSTEM_ERROR_CODES.has(code)
        ? `${operation}: ${cause.message}`
        : undefined;
};
export const entryFailure = (...[path, kind, code, message, size]) => ({
    status: "failed",
    kind,
    path,
    code,
    message,
    ...(size === undefined ? {} : { size }),
});
