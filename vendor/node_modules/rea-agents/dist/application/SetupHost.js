import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { PRODUCT_IDENTITY } from "../identity.js";
import { npxRegistrationCommand } from "./ClientRegistrationIdentity.js";
import { SUPPORTED_NODE_VERSION_PROSE, supportsNodeVersion, } from "../domain/runtimeVersion.js";
import { runDoctor, systemDoctorHost } from "./Doctor.js";
import { installLinuxHopper, readLinuxDistribution } from "./LinuxHopper.js";
import { installMacHopper } from "./MacHopper.js";
import { supportedClients } from "./SupportedClients.js";
import { canonicalSkillNeedsInstall, installCanonicalSkill, } from "./SetupSkill.js";
import { clientConfigurationAligned, configureClientConfiguration, inspectClientConfiguration, } from "./SetupClientConfiguration.js";
import { setupInstallFailure } from "./SetupInstallFailure.js";
import { providerRegistrationEnvironment } from "./SetupRegistrationEnvironment.js";
/** Resolve the executable and arguments used in a managed MCP registration. */
export const setupRegistrationCommand = (platform, useNpmRunner = process.env.npm_command === "exec") => useNpmRunner
    ? npxRegistrationCommand(platform)
    : platform === "win32"
        ? [
            process.execPath,
            resolve(process.argv[1] ?? PRODUCT_IDENTITY.cliBinary),
            "mcp",
        ]
        : [resolve(process.argv[1] ?? PRODUCT_IDENTITY.cliBinary), "mcp"];
export const filterClientsNeedingConfigure = async (host, detectedClients, providerEnvironment, command) => {
    const needs = await Promise.all(detectedClients.map((client) => host.clientNeedsConfigure(client, providerEnvironment, command)));
    return detectedClients.filter((_, index) => needs[index]);
};
export const initialProviderEnvironment = async (host, hopperPath) => ({
    ...(await host.providerEnvironment?.()),
    ...(hopperPath === undefined ? {} : { HOPPER_LAUNCHER_PATH: hopperPath }),
});
export const hostRemediation = async (host, installHopper) => {
    if (!supportsNodeVersion(host.nodeVersion))
        return `Install ${SUPPORTED_NODE_VERSION_PROSE} and rerun setup.`;
    if (!installHopper)
        return undefined;
    if (host.platform !== "darwin" && host.platform !== "linux")
        return "REA supports Hopper on macOS and selected 64-bit Linux distributions.";
    if (host.platform === "darwin") {
        const version = await host.macosVersion();
        return version === undefined || major(version) < 12
            ? "Upgrade to macOS 12 or newer."
            : undefined;
    }
    if ((await host.linuxDistribution())?.supported === true)
        return undefined;
    return "Automated Hopper setup supports Ubuntu 24.04+, Fedora 41+, 64-bit Arch Linux, and CachyOS; configure an existing supported provider instead.";
};
/** Production setup effects for Hopper, agent configuration, and the canonical skill directory. */
export const systemSetupHost = (doctorHost = systemDoctorHost()) => {
    const platform = doctorHost.platform;
    return {
        platform,
        nodeVersion: process.versions.node,
        macosVersion: () => doctorHost.macosVersion(),
        linuxDistribution: readLinuxDistribution,
        hopperPath: async () => (await runDoctor(undefined, doctorHost)).hopperPath,
        initialSetupState: async (scope) => {
            const diagnosis = await runDoctor(undefined, doctorHost, scope);
            return {
                ...(diagnosis.hopperPath === undefined
                    ? {}
                    : { hopperPath: diagnosis.hopperPath }),
                providerEnvironment: {
                    ...providerRegistrationEnvironment(diagnosis.providerInspections ?? []),
                    ...(diagnosis.hopperPath === undefined
                        ? {}
                        : { HOPPER_LAUNCHER_PATH: diagnosis.hopperPath }),
                },
                doctor: diagnosis,
            };
        },
        providerEnvironment: async () => {
            const diagnosis = await runDoctor(undefined, doctorHost);
            return {
                ...providerRegistrationEnvironment(diagnosis.providerInspections ?? []),
                ...(diagnosis.hopperPath === undefined
                    ? {}
                    : { HOPPER_LAUNCHER_PATH: diagnosis.hopperPath }),
            };
        },
        installHopper: async (replaceExisting) => {
            const result = platform === "linux"
                ? await installLinuxHopper()
                : await installMacHopper({ replaceExisting });
            if (result.status === "installed")
                return result;
            return setupInstallFailure(result.reason);
        },
        detectedClients: () => detectClients(homedir()),
        supportedClients: () => Promise.resolve(supportedClients(homedir())),
        configureClient: (client, providerEnvironment, command) => client.format === "unsupported"
            ? Promise.resolve({ status: "skipped" })
            : configureClientConfiguration(client, providerEnvironment, command),
        clientNeedsConfigure: (client, providerEnvironment, command) => client.format === "unsupported"
            ? Promise.resolve(false)
            : clientConfigurationAligned(client, providerEnvironment, command).then((aligned) => !aligned),
        inspectClientConfiguration: inspectClientConfiguration,
        skillNeedsInstall: () => canonicalSkillNeedsInstall(homedir()),
        installSkill: () => installCanonicalSkill(homedir()),
        doctor: (scope) => runDoctor(undefined, doctorHost, scope),
    };
};
/** Detect supported agents from their config files or stable installation markers. */
export const detectClients = async (home) => {
    const detected = [];
    for (const candidate of supportedClients(home)) {
        const [hasConfig, hasMarker] = await Promise.all([
            exists(candidate.configPath),
            candidate.markerPath === undefined ? false : exists(candidate.markerPath),
        ]);
        if (hasConfig || hasMarker)
            detected.push(candidate);
    }
    return detected;
};
const major = (version) => Number.parseInt(version.split(".")[0] ?? "0", 10);
const exists = async (path) => {
    try {
        await access(path);
        return true;
    }
    catch (cause) {
        // best-effort cleanup: optional host probing; absence means unavailable.
        void cause;
        return false;
    }
};
