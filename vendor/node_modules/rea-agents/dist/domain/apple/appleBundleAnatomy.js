import { z } from "zod";
import { digestSchema, prefixedDigestSchema } from "../digests.js";
const pathSchema = z.string().min(1);
const BUNDLE_EXTENSION = /\.(?:app|appex|xpc|framework|systemextension|dext|bundle|plugin|qlgenerator|mdimporter)$/iu;
const MACH_O_FORMATS = ["mach-o", "mach-o-universal"];
/** One inventoried file or directory with its content identity. */
export const appleComponentSchema = z.strictObject({
    path: pathSchema,
    artifact_id: prefixedDigestSchema("art"),
    sha256: digestSchema,
    format: z.string().min(1),
});
/** One application root or nested bundle classified by path convention. */
export const appleBundleSchema = z.strictObject({
    path: pathSchema,
    parent_path: pathSchema.nullable(),
    layout: z.enum(["shallow", "macos-deep", "versioned-framework"]),
    role: z.enum([
        "application",
        "app-extension",
        "xpc-service",
        "framework",
        "login-item",
        "system-extension",
        "driver-extension",
        "plug-in",
        "resource-bundle",
        "bundle",
        "helper-application",
        "nested-application",
    ]),
    role_basis: z.literal("path-convention"),
    info_plist_path: pathSchema.nullable(),
    executable_candidates: z.array(pathSchema),
    signing_paths: z.array(pathSchema),
});
/** Report whether an inventory format is a thin or universal Mach-O. */
export const isMachOFormat = (format) => MACH_O_FORMATS.includes(format);
/** AppleDouble metadata written beside archived files (`._name`, `__MACOSX/`). */
export const isSidecar = (path) => {
    const segments = path.split("/");
    return (segments.includes("__MACOSX") || (segments.at(-1) ?? "").startsWith("._"));
};
export const isWithin = (path, root) => root === "." || path === root || path.startsWith(`${root}/`);
/**
 * Outermost iOS (`Payload/X.app`) and macOS (`X.app/Contents/…`) applications.
 * An inventoried `.app` directory is its own root, `.`.
 */
export const applicationRoots = (entries, subject) => {
    // A selected `.app` directory is the application, even when its inventory
    // is partial or lacks Contents/; coverage and limitations describe that.
    if (subject.format === "directory" && /\.app$/iu.test(subject.name))
        return ["."];
    const found = new Set();
    for (const { path } of entries) {
        if (isSidecar(path))
            continue;
        const ios = /^(Payload\/[^/]+\.app)(?:\/|$)/u.exec(path);
        if (ios?.[1] !== undefined) {
            found.add(ios[1]);
            continue;
        }
        const segments = path.split("/");
        const index = segments.findIndex((segment, position) => /\.app$/iu.test(segment) && segments[position + 1] === "Contents");
        if (index >= 0)
            found.add(segments.slice(0, index + 1).join("/"));
    }
    const roots = [...found];
    return roots
        .filter((root) => !roots.some((other) => other !== root && isWithin(root, other)))
        .sort(compare);
};
export const detectBundles = (entries, roots) => {
    const paths = new Set(roots);
    for (const { path, kind } of entries) {
        if (isSidecar(path))
            continue;
        const root = roots.find((candidate) => isWithin(path, candidate));
        if (root === undefined)
            continue;
        const segments = path.split("/");
        const start = root === "." ? 0 : root.split("/").length;
        for (let index = start; index < segments.length; index++) {
            const segment = segments[index] ?? "";
            const leaf = index === segments.length - 1;
            // A symlink or file named like a bundle has no observed contents.
            if (BUNDLE_EXTENSION.test(segment) && (!leaf || kind === "directory"))
                paths.add(segments.slice(0, index + 1).join("/"));
        }
    }
    const tree = indexTree(entries);
    return [...paths].sort(compare).map((path) => {
        const layout = bundleLayout(path, tree);
        return {
            path,
            parent_path: enclosingBundle(path, paths),
            layout,
            role: roots.includes(path) ? "application" : bundleRole(path),
            role_basis: "path-convention",
            info_plist_path: infoPlistPath(path, layout, tree),
            executable_candidates: executableCandidates(path, layout, tree),
            signing_paths: signingPaths(path, layout, tree),
        };
    });
};
const indexTree = (entries) => {
    const children = new Map();
    const files = new Map();
    const directories = new Set();
    for (const { path, kind, component } of entries) {
        if (isSidecar(path))
            continue;
        if (kind === "file" && component !== undefined)
            files.set(path, component);
        if (kind === "directory")
            directories.add(path);
        const segments = path.split("/");
        let parent = "";
        for (const segment of segments) {
            const names = children.get(parent) ?? new Set();
            names.add(segment);
            children.set(parent, names);
            parent = joinPath(parent, segment);
            if (parent !== path)
                directories.add(parent);
        }
    }
    return { children, files, directories };
};
const joinPath = (directory, name) => directory === "" ? name : `${directory}/${name}`;
const directoryOf = (bundle) => (bundle === "." ? "" : bundle);
const enclosingBundle = (path, bundles) => {
    if (path === ".")
        return null;
    const segments = path.split("/");
    for (let length = segments.length - 1; length > 0; length--) {
        const candidate = segments.slice(0, length).join("/");
        if (bundles.has(candidate))
            return candidate;
    }
    return bundles.has(".") ? "." : null;
};
const bundleLayout = (bundle, tree) => {
    const names = tree.children.get(directoryOf(bundle));
    if (names?.has("Contents") === true)
        return "macos-deep";
    if (names?.has("Versions") === true)
        return "versioned-framework";
    return "shallow";
};
const bundleRole = (bundle) => {
    const segments = bundle.split("/");
    const name = (segments.at(-1) ?? "").toLowerCase();
    const container = segments.at(-2);
    if (name.endsWith(".appex"))
        return "app-extension";
    if (name.endsWith(".xpc"))
        return "xpc-service";
    if (name.endsWith(".framework"))
        return "framework";
    if (name.endsWith(".systemextension"))
        return "system-extension";
    if (name.endsWith(".dext"))
        return "driver-extension";
    if (name.endsWith(".bundle")) {
        if (container === "PlugIns")
            return "plug-in";
        return container === "Resources" ? "resource-bundle" : "bundle";
    }
    if (!name.endsWith(".app"))
        return "plug-in";
    if (container === "LoginItems" && segments.at(-3) === "Library")
        return "login-item";
    if (container === "Helpers")
        return "helper-application";
    return "nested-application";
};
/** Files directly inside one directory; nested bundles are deeper paths. */
const directFiles = (directory, tree) => [...(tree.children.get(directory) ?? [])]
    .map((name) => joinPath(directory, name))
    .filter((path) => tree.files.has(path))
    .sort(compare);
/** Content directories; `Versions/Current` is a symlink outside the inventory. */
const contentDirectories = (bundle, layout, tree) => {
    const directory = directoryOf(bundle);
    if (layout === "macos-deep")
        return [joinPath(directory, "Contents")];
    if (layout === "shallow")
        return [directory];
    const versions = joinPath(directory, "Versions");
    // Only real version directories count: Current is a symlink, and files
    // such as .DS_Store are not versions.
    return [...(tree.children.get(versions) ?? [])]
        .filter((version) => version !== "Current")
        .map((version) => joinPath(versions, version))
        .filter((version) => tree.directories.has(version))
        .sort(compare);
};
const infoPlistPath = (bundle, layout, tree) => {
    const directories = contentDirectories(bundle, layout, tree);
    // With several real versions, Versions/Current (a symlink outside the
    // inventory) decides which plist applies, so the plist stays unknown.
    if (directories.length !== 1)
        return null;
    const candidates = directories
        .map((directory) => joinPath(directory, layout === "versioned-framework"
        ? "Resources/Info.plist"
        : "Info.plist"))
        .filter((path) => tree.files.has(path));
    return candidates.length === 1 ? (candidates[0] ?? null) : null;
};
const executableCandidates = (bundle, layout, tree) => contentDirectories(bundle, layout, tree)
    .flatMap((directory) => directFiles(layout === "macos-deep" ? joinPath(directory, "MacOS") : directory, tree))
    .filter((path) => MACH_O_FORMATS.includes(tree.files.get(path)?.format ?? ""));
const signingPaths = (bundle, layout, tree) => contentDirectories(bundle, layout, tree)
    .flatMap((directory) => [
    joinPath(directory, "_CodeSignature/CodeResources"),
    joinPath(directory, "embedded.provisionprofile"),
    joinPath(directory, "embedded.mobileprovision"),
])
    .filter((path) => tree.files.has(path))
    .sort(compare);
/** Platforms of application roots whose layout was observed, not assumed. */
export const platformsOf = (bundles) => [
    ...new Set(bundles.flatMap(({ role, layout, info_plist_path: plist }) => {
        if (role !== "application")
            return [];
        if (layout === "macos-deep")
            return ["macos"];
        // An empty or partial root has no Contents/ either; require Info.plist.
        if (layout === "shallow" && plist !== null)
            return ["ios"];
        return [];
    })),
].sort(compare);
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
