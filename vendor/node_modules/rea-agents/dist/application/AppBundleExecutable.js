import { execFile } from "node:child_process";
import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { BinaryTargetError } from "../domain/configurationErrors.js";
import { isPathWithinRoot } from "../domain/localPath.js";
import { parseXmlPropertyList } from "../domain/propertyListKeys.js";
import { decodeXmlPlistText } from "../domain/propertyListXmlText.js";
import { err, ok } from "../domain/result.js";
const execFileAsync = promisify(execFile);
const BUNDLE_LAYOUTS = [
    // macOS bundles keep both under Contents.
    {
        plist: ["Contents", "Info.plist"],
        programs: ["Contents", "MacOS"],
        programsLabel: "Contents/MacOS",
    },
    // iOS-style bundles, as extracted from an IPA, keep both at the root.
    { plist: ["Info.plist"], programs: [], programsLabel: "the bundle root" },
];
const defaultFileSystem = { readFile, realpath };
/**
 * Resolve an app bundle directory to its declared program file. macOS and
 * flat iOS-style layouts are read directly. An iOS app installed on a Mac is
 * a wrapper whose `Wrapper` directory holds the iOS bundle; that bundle is
 * found by listing `Wrapper`, never by following the `WrappedBundle` link.
 */
export const resolveAppBundleExecutable = async (path, fileSystem = defaultFileSystem) => {
    try {
        const layout = await presentLayout(path);
        if (layout !== undefined)
            return resolveLayoutExecutable(path, layout, fileSystem);
        const wrapped = await wrappedBundle(path);
        if (wrapped !== undefined) {
            const wrappedLayout = await presentLayout(wrapped);
            if (wrappedLayout !== undefined)
                return resolveLayoutExecutable(wrapped, wrappedLayout, fileSystem);
        }
    }
    catch (cause) {
        if (cause instanceof BinaryTargetError)
            return err(cause);
        return err(new BinaryTargetError(path, errorReason(cause, path), { cause }));
    }
    return err(new BinaryTargetError(path, `app Info.plist is missing or no supported bundle layout was found: ${path}`, {
        cause: new Error("No Contents/Info.plist, root Info.plist, or single Wrapper/*.app bundle was found"),
    }));
};
const presentLayout = async (bundle) => {
    for (const layout of BUNDLE_LAYOUTS)
        if (await layoutPlistPresent(join(bundle, ...layout.plist)))
            return layout;
    return undefined;
};
/**
 * Whether a layout's Info.plist exists. Readable symlinks count, as they did
 * when the plist was read directly; any failure other than absence, such as
 * a permission denial, is left for the caller to report.
 */
const layoutPlistPresent = async (path) => {
    try {
        return (await stat(path)).isFile();
    }
    catch (cause) {
        if (isAbsence(cause))
            return false;
        if (isPermissionDenied(cause))
            throw new BinaryTargetError(path, `permission denied inspecting app Info.plist ${path}`, { cause });
        throw cause;
    }
};
const isAbsence = (cause) => {
    const code = errorCode(cause);
    return code === "ENOENT" || code === "ENOTDIR";
};
const errorCode = (cause) => cause instanceof Error ? Reflect.get(cause, "code") : undefined;
const codeDescription = (cause) => {
    const code = errorCode(cause);
    return typeof code === "string" || typeof code === "number"
        ? ` (${String(code)})`
        : "";
};
const isSystemErrorCode = (cause) => {
    const code = errorCode(cause);
    return (typeof code === "string" &&
        /^[A-Z][A-Z0-9_]+$/u.test(code) &&
        !code.startsWith("ERR_"));
};
const isPermissionDenied = (cause) => errorCode(cause) === "EACCES" || errorCode(cause) === "EPERM";
const errorReason = (cause, path) => isPermissionDenied(cause)
    ? `permission denied accessing app bundle path ${path}`
    : isAbsence(cause)
        ? `app bundle path is missing: ${path}`
        : `could not inspect app bundle path ${path}`;
/** The single real `.app` directory inside an iOS-on-Mac `Wrapper`. */
const wrappedBundle = async (bundle) => {
    const wrapper = join(bundle, "Wrapper");
    try {
        if (!(await lstat(wrapper)).isDirectory())
            return undefined;
    }
    catch (cause) {
        if (isAbsence(cause))
            return undefined;
        throw cause;
    }
    const apps = (await readdir(wrapper, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name.toLowerCase().endsWith(".app"));
    const [app] = apps;
    return apps.length === 1 && app !== undefined
        ? join(wrapper, app.name)
        : undefined;
};
const resolveLayoutExecutable = async (bundle, layout, fileSystem) => {
    const plistPath = join(bundle, ...layout.plist);
    let plist;
    try {
        plist = await fileSystem.readFile(plistPath);
    }
    catch (cause) {
        return err(new BinaryTargetError(plistPath, isPermissionDenied(cause)
            ? `permission denied reading app Info.plist ${plistPath}`
            : isAbsence(cause)
                ? `app Info.plist is missing: ${plistPath}`
                : `could not read app Info.plist ${plistPath}${codeDescription(cause)}`, { cause }));
    }
    let name;
    try {
        name =
            plist.subarray(0, 6).toString("ascii") === "bplist"
                ? await (fileSystem.decodeBinaryPlist ?? readBinaryPlistExecutable)(plistPath)
                : parseXmlPlistExecutable(decodeXmlPlistText(plist));
    }
    catch (cause) {
        return err(new BinaryTargetError(plistPath, isPermissionDenied(cause)
            ? `permission denied decoding app Info.plist ${plistPath}${codeDescription(cause)}`
            : isSystemErrorCode(cause)
                ? `could not decode app Info.plist ${plistPath}${codeDescription(cause)}`
                : `app Info.plist is malformed, unsupported, or lacks CFBundleExecutable: ${plistPath}${cause instanceof Error ? ` (${cause.message})` : ""}`, { cause }));
    }
    if (!isSafeExecutableName(name))
        return err(new BinaryTargetError(bundle, "app has an unsafe CFBundleExecutable"));
    const programs = join(bundle, ...layout.programs);
    const executable = join(programs, name);
    try {
        const [canonicalPrograms, canonicalExecutable] = await Promise.all([
            fileSystem.realpath(programs),
            fileSystem.realpath(executable),
        ]);
        if (!isPathWithinRoot(canonicalPrograms, canonicalExecutable))
            return err(new BinaryTargetError(bundle, `app program file leaves ${layout.programsLabel}`));
        return ok({ executable: canonicalExecutable, infoPlist: plistPath });
    }
    catch (cause) {
        return err(new BinaryTargetError(executable, isPermissionDenied(cause)
            ? `permission denied resolving app program file ${executable}`
            : isAbsence(cause)
                ? `app program file is missing: ${executable}`
                : `could not resolve app program file ${executable}`, { cause }));
    }
};
/** Decode the top-level executable name with an XML parser, not a pattern. */
const parseXmlPlistExecutable = (plist) => {
    // An unrelated `__proto__` entry must not make the bundle unreadable.
    const { value } = parseXmlPropertyList(plist);
    const executable = executableEntrySchema.safeParse(value);
    if (!executable.success)
        throw new Error("CFBundleExecutable is missing");
    return executable.data.CFBundleExecutable;
};
const executableEntrySchema = z.looseObject({ CFBundleExecutable: z.string() });
const readBinaryPlistExecutable = async (plistPath) => 
// `-n` strips only the newline plutil appends; it requires macOS 12+.
(await execFileAsync("/usr/bin/plutil", [
    "-extract",
    "CFBundleExecutable",
    "raw",
    "-n",
    "-o",
    "-",
    plistPath,
])).stdout;
const isSafeExecutableName = (name) => name.length > 0 &&
    name !== "." &&
    name !== ".." &&
    !name.includes("\0") &&
    !/[/\\]/u.test(name);
