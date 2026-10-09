import { constants } from "node:fs";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { windowsNativeCapabilities, } from "../process/WindowsAuthority.js";
import { probeProcessCaptureCapability, } from "../process/capture/ProcessCaptureCapability.js";
/** Probe named prerequisites without converting missing controls into support. */
export const probeWindowsCapabilities = async (dependencies = systemDependencies()) => {
    const [symlinkCreation, pty] = await Promise.all([
        dependencies.probeSymlinkCreation(),
        dependencies.probePty(),
    ]);
    return {
        platform: dependencies.platform,
        architecture: dependencies.architecture,
        capabilities: {
            symlink_creation: symlinkCreation,
            no_follow_open: dependencies.probeNoFollowOpen(),
            private_acl: dependencies.probePrivateAcl(),
            unix_domain_socket: dependencies.probeUnixDomainSocket(),
            pty: pty.available
                ? { available: true, reason: null }
                : { available: false, reason: pty.reason },
        },
        security: dependencies.nativeCapabilities?.() ??
            windowsNativeCapabilities(dependencies.platform),
    };
};
const systemDependencies = () => ({
    platform: process.platform,
    architecture: process.arch,
    probeSymlinkCreation,
    probeNoFollowOpen: () => systemNoFollowOpenCapability(process.platform, constants.O_NOFOLLOW),
    probePrivateAcl: () => windowsNativeCapabilities(process.platform).private_runtime_dacl,
    nativeCapabilities: () => windowsNativeCapabilities(process.platform),
    probeUnixDomainSocket: () => process.platform === "win32"
        ? {
            available: false,
            reason: "Node path-based IPC uses named pipes on Windows",
        }
        : { available: true, reason: null },
    probePty: probeProcessCaptureCapability,
});
/** Report pathname no-follow support without treating it as Windows authority. */
export const systemNoFollowOpenCapability = (platform, noFollow) => {
    if (platform === "win32")
        return {
            available: false,
            reason: "Node pathname O_NOFOLLOW is not Windows handle authority; native admission is reported separately in security.",
        };
    return typeof noFollow === "number"
        ? { available: true, reason: null }
        : {
            available: false,
            reason: "O_NOFOLLOW is unavailable in this Node runtime",
        };
};
const probeSymlinkCreation = async () => {
    const root = await mkdtemp(join(tmpdir(), "rea-symlink-probe-"));
    const target = join(root, "target");
    const link = join(root, "link");
    try {
        await writeFile(target, "probe");
        await symlink(target, link, "file");
        return { available: true, reason: null };
    }
    catch (cause) {
        return {
            available: false,
            reason: cause instanceof Error &&
                "code" in cause &&
                typeof cause.code === "string"
                ? cause.code
                : "symlink creation failed",
        };
    }
    finally {
        try {
            await rm(root, { recursive: true, force: true });
        }
        catch (cause) {
            // Cleanup failure must not replace the machine-readable probe outcome.
            // The probe root lives beneath the OS temporary directory and is unique.
            void cause;
        }
    }
};
