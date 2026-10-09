import { FIRMWARE_RELEASES } from "./FirmwareRelease.js";
const TOKEN = /^(\d+)\.(\d+)\.(\d+)([-+][0-9A-Za-z.-]+)?$/u;
const parseToken = (token) => {
    const match = TOKEN.exec(token);
    if (match === null)
        return undefined;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    const patch = Number(match[3]);
    if (![major, minor, patch].every((part) => Number.isSafeInteger(part)))
        return undefined;
    const suffix = match[4] ?? "";
    return { major, minor, patch, suffix, token };
};
const verifiedRelease = (engine) => {
    const parsed = parseToken(FIRMWARE_RELEASES[engine].version);
    if (parsed === undefined || parsed.suffix !== "")
        throw new Error(`FIRMWARE_RELEASES.${engine}.version is not a release number`);
    return parsed;
};
/** Caller-facing engine name. */
export const firmwareEngineLabel = (engine) => {
    switch (engine) {
        case "binwalk":
            return "Binwalk";
        case "unblob":
            return "Unblob";
        default: {
            const unreachable = engine;
            return unreachable;
        }
    }
};
/** Release line accepted for one engine, such as `Binwalk 3.1.x`. */
export const firmwareReleaseLine = (engine) => {
    const verified = verifiedRelease(engine);
    return `${firmwareEngineLabel(engine)} ${String(verified.major)}.${String(verified.minor)}.x`;
};
/**
 * Classify a `--version` banner against the audited release line.
 * Binwalk prints `binwalk <version>`; Unblob prints the version alone.
 */
export const admitFirmwareVersion = (engine, banner) => {
    const token = versionToken(engine, banner);
    const parsed = token === undefined ? undefined : parseToken(token);
    const verified = verifiedRelease(engine);
    const accepted = `accepted releases are ${firmwareReleaseLine(engine)} (verified with ${verified.token})`;
    if (parsed === undefined)
        return {
            status: "unresolved",
            message: `Unsupported tool version ${banner.length === 0 ? "missing" : banner}; ${accepted}.`,
        };
    if (parsed.major !== verified.major || parsed.minor !== verified.minor)
        return {
            status: "unsupported",
            message: `Unsupported tool version ${banner}; ${accepted}.`,
        };
    if (parsed.token === verified.token)
        return { status: "verified", version: parsed.token };
    const line = `${String(verified.major)}.${String(verified.minor)}.x`;
    return {
        status: "compatible",
        version: parsed.token,
        limitation: `This session uses ${firmwareEngineLabel(engine)} ${parsed.token}. The report parser is verified against ${verified.token}; other ${line} builds are accepted and the observed version is reported.`,
    };
};
const versionToken = (engine, banner) => {
    switch (engine) {
        case "binwalk":
            return banner.startsWith("binwalk ")
                ? banner.slice("binwalk ".length)
                : undefined;
        case "unblob":
            return banner;
        default: {
            const unreachable = engine;
            return unreachable;
        }
    }
};
