/** Safe CLI projection for a historical-source import failure. */
export const projectReferenceSourceImportError = (error) => {
    if (error.code === "cancelled")
        return {
            category: "cancelled",
            message: "Reference source import was cancelled. Start it again when ready.",
        };
    if (error.code === "invalid-root")
        return {
            category: "invalid_input",
            message: "Reference source directory could not be opened. Check that the path exists, is readable, and points to a directory.",
        };
    if (error.code === "unsupported")
        return {
            category: "unsupported_host",
            message: "Safe no-follow file opens are unavailable on this host. Import the source tree with REA on Linux (including WSL) or macOS.",
        };
    if (error.code === "io")
        return {
            category: "execution_failure",
            message: "Reference source files could not be read. Check directory permissions and try again.",
        };
    return {
        category: "execution_failure",
        message: "Reference source could not be indexed. Check that the source tree is readable, then try again.",
    };
};
export const DEFAULT_REFERENCE_SOURCE_IGNORE_PATTERNS = [
    ".git/",
    ".git/hooks/",
    "node_modules/",
    "dist/",
    "build/",
    "coverage/",
    "htmlcov/",
    ".coverage",
    "*.log",
];
export const PARSEABLE_REFERENCE_SOURCE_LANGUAGES = new Set(["JavaScript", "TypeScript", "JSX", "TSX"]);
