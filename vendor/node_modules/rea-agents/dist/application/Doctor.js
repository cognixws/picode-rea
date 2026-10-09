import { constants } from "node:fs";
import { access, readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { analysisErrorRemediationAction } from "../domain/analysisErrorPresentation.js";
import { parseBinaryTarget } from "./BinaryTargetResolver.js";
import { execFileOutput } from "../process/ExecFileOutput.js";
import { probeHomebrew } from "./homebrew.js";
import { linuxHopperBinarySupported, linuxSharedLibrariesAvailable, readLinuxDistribution, } from "./LinuxHopper.js";
import { canonicalSkillNeedsInstall } from "./SetupSkill.js";
import { CATALOG_IDENTITY } from "../catalogIdentity.js";
import { PRODUCT_IDENTITY, SDK_IDENTITY } from "../identity.js";
import { readClientRegistrationStatuses, } from "./ClientRegistrationStatus.js";
import { collectDoctorDiagnostics, doctorHealthy, } from "./DoctorDiagnostics.js";
import { normalizeDoctorScope, scopeDoctorChecks, } from "./DoctorScope.js";
/** Deep provider IDs whose readiness can be selected explicitly by doctor. */
export const DOCTOR_PROVIDER_IDS = ["hopper", "ghidra", "ida"];
/**
 * Check requirements and an optional target without mutating the host.
 * Every failed check includes remediation suitable for either the one-shot CLI
 * or an agent consuming the structured result.
 */
export const runDoctor = async (target, host = systemDoctorHost(), requestedScope) => {
    const { checks: diagnosticChecks, hopperPath, providerInspections, } = await collectDoctorDiagnostics(target, host);
    const identity = await collectDoctorIdentity(host);
    const checks = [...diagnosticChecks, ...identity.checks];
    const providers = {
        hopperAvailable: hopperPath !== undefined &&
            checks
                .filter(({ name }) => name.startsWith("hopper"))
                .every(({ ok }) => ok),
        hopperConfigured: host.configuredHopperPath !== undefined,
        providerInspections,
    };
    const environmentHealthy = doctorHealthy(checks, providers);
    const scope = normalizeDoctorScope(requestedScope, target);
    const scoped = scopeDoctorChecks({
        checks,
        registrations: identity.value.registrations,
        skillState: identity.value.skill.state,
        providers,
        scope,
    });
    return {
        healthy: scope.mode === "audit-wide" ? environmentHealthy : scoped.healthy,
        environment_healthy: environmentHealthy,
        scope,
        scope_checks: scope.mode === "audit-wide" ? checks : scoped.scopeChecks,
        informational_checks: scope.mode === "audit-wide" ? [] : scoped.informationalChecks,
        ...(hopperPath === undefined ? {} : { hopperPath }),
        ...(providerInspections === undefined ? {} : { providerInspections }),
        checks,
        identity: identity.value,
    };
};
const collectDoctorIdentity = async (host) => {
    const installationPaths = (await host.installationPaths?.()) ?? [];
    const installedSkillIdentity = await host.installedSkillIdentity?.();
    const skillAligned = skillIdentityAligned(installedSkillIdentity);
    const registrations = (await host.clientRegistrations?.()) ?? [];
    return {
        checks: [
            ...(skillAligned ? [] : [skillIdentityCheck(installedSkillIdentity)]),
            ...registrations
                .filter((registration) => registration.state !== "aligned" && registration.state !== "manual")
                .map(registrationCheck),
        ],
        value: {
            cli_package_version: PRODUCT_IDENTITY.packageVersion,
            expected_skill_version: PRODUCT_IDENTITY.skillVersion,
            sdk: SDK_IDENTITY,
            catalog: CATALOG_IDENTITY,
            live_server: {
                state: "unknown",
                remediation: "Call binary_session in the active client to inspect the running server identity.",
            },
            installations: {
                paths: installationPaths,
                state: installationState(installationPaths),
            },
            skill: {
                installed_version: installedSkillIdentity?.version ?? null,
                installed_tool_count: installedSkillIdentity?.toolCount ?? null,
                installed_catalog_digest: installedSkillIdentity?.catalogDigest ?? null,
                state: installedSkillIdentity === undefined
                    ? "missing"
                    : skillAligned
                        ? "aligned"
                        : "stale",
                remediation: skillAligned
                    ? null
                    : "Run rea setup to update the installed REA skill.",
            },
            registrations,
        },
    };
};
const skillIdentityAligned = (identity) => identity?.version === PRODUCT_IDENTITY.skillVersion &&
    identity.toolCount === CATALOG_IDENTITY.counts.mcp_tools &&
    identity.canonical;
const skillIdentityCheck = (identity) => ({
    name: "skill:identity",
    ok: false,
    classification: "config_drift",
    detail: identity === undefined
        ? "Installed REA skill identity is missing."
        : "Installed REA skill identity is stale.",
    remediation: "Run rea setup to update the installed REA skill.",
});
const registrationCheck = (registration) => ({
    name: `registration:${registration.client}`,
    ok: false,
    classification: "config_drift",
    detail: registration.config_path,
    remediation: registration.remediation,
});
const installationState = (paths) => paths.length === 0 ? "unknown" : paths.length === 1 ? "single" : "multiple";
const homeFromEnvironment = (environment, platform) => {
    const selected = platform === "win32"
        ? (environment.USERPROFILE ??
            (environment.HOMEDRIVE !== undefined &&
                environment.HOMEPATH !== undefined
                ? `${environment.HOMEDRIVE}${environment.HOMEPATH}`
                : environment.HOME))
        : (environment.HOME ?? environment.USERPROFILE);
    return selected ?? homedir();
};
/** Create diagnostics backed by the current process and host commands. */
export const systemDoctorHost = (options = {}) => {
    const platform = options.platform ?? process.platform;
    const architecture = options.architecture ?? process.arch;
    const environment = options.environment ?? process.env;
    const hostExecFileOutput = options.execFileOutput ?? execFileOutput;
    const homeDirectory = homeFromEnvironment(environment, platform);
    const commandEnvironment = { env: environment };
    return {
        platform,
        architecture,
        nodeVersion: process.versions.node,
        homeDirectory,
        ...(environment.HOPPER_LAUNCHER_PATH === undefined
            ? {}
            : { configuredHopperPath: environment.HOPPER_LAUNCHER_PATH }),
        ...(environment.REA_ILSPY_CMD_PATH === undefined
            ? {}
            : { configuredIlspyCmdPath: environment.REA_ILSPY_CMD_PATH }),
        macosVersion: () => readMacosVersion(hostExecFileOutput, commandEnvironment),
        linuxDistribution: readLinuxDistribution,
        async validTarget(path) {
            return (await parseBinaryTarget(path, process.cwd(), architecture)).ok;
        },
        async inspectTarget(path) {
            const result = await parseBinaryTarget(path, process.cwd(), architecture);
            if (result.ok)
                return {
                    name: "target",
                    ok: true,
                    classification: "healthy",
                    detail: path,
                };
            const error = result.error;
            return {
                name: "target",
                ok: false,
                classification: error.constraint === "directory_requires_file"
                    ? "unsupported_target"
                    : "config_drift",
                detail: path,
                details: {
                    reason: error.reason,
                    ...(error.constraint === undefined
                        ? {}
                        : { constraint: error.constraint }),
                },
                remediation: analysisErrorRemediationAction(error),
            };
        },
        executable: (path) => executableAvailable(path, platform, hostExecFileOutput, commandEnvironment),
        linuxDemoRuntimeCheck: options.linuxDemoRuntimeCheck ?? uncomposedLinuxDemoRuntimeCheck,
        supportedLinuxHopper: linuxHopperBinarySupported,
        async brewHopperPath() {
            return probeHomebrew(async (command) => {
                try {
                    const prefix = (await hostExecFileOutput(command, ["--prefix", "--cask", "hopper-disassembler"], commandEnvironment)).stdout.trim();
                    return `${prefix}/Hopper Disassembler.app/Contents/MacOS/hopper`;
                }
                catch (cause) {
                    // best-effort cleanup: optional Homebrew probing; absence means uninstalled.
                    void cause;
                    return undefined;
                }
            });
        },
        manualHopperPaths: () => manualHopperPaths(homeDirectory),
        ...(options.providerInspections === undefined
            ? {}
            : { providerInspections: options.providerInspections }),
        async ilspyCmdVersion(path) {
            try {
                await access(path, constants.X_OK);
                return firstIlspyVersionLine((await hostExecFileOutput(path, ["--version"], {
                    timeout: 10_000,
                    ...commandEnvironment,
                })).stdout);
            }
            catch (cause) {
                // best-effort cleanup: optional version probing; failure means unavailable.
                void cause;
                return undefined;
            }
        },
        async installationPaths() {
            try {
                const command = platform === "win32" ? "where" : "which";
                const arguments_ = platform === "win32" ? ["rea"] : ["-a", "rea"];
                return uniqueLines((await hostExecFileOutput(command, arguments_, commandEnvironment))
                    .stdout);
            }
            catch (cause) {
                // best-effort cleanup: optional path probing; failure means none found.
                void cause;
                return [];
            }
        },
        installedSkillIdentity: () => installedSkillIdentity(homeDirectory),
        clientRegistrations: () => readClientRegistrationStatuses(homeDirectory, undefined, {
            platform,
            environment,
        }),
    };
};
const readMacosVersion = async (run = execFileOutput, options = { env: process.env }) => {
    try {
        return (await run("sw_vers", ["-productVersion"], options)).stdout.trim();
    }
    catch (cause) {
        // best-effort cleanup: optional OS version probing; failure means unknown.
        void cause;
        return undefined;
    }
};
const executableAvailable = async (path, platform = process.platform, run = execFileOutput, options = { env: process.env }) => {
    try {
        await access(path, constants.X_OK);
        if (platform !== "linux")
            return true;
        const linked = await run("ldd", [path], options);
        return linuxSharedLibrariesAvailable(`${linked.stdout}\n${linked.stderr}`);
    }
    catch (cause) {
        // best-effort cleanup: optional executable probing; failure means unavailable.
        void cause;
        return false;
    }
};
const uncomposedLinuxDemoRuntimeCheck = () => Promise.resolve({
    name: "hopper-demo-runtime",
    ok: false,
    classification: "config_drift",
    detail: "Linux Hopper private-display diagnostics were not composed",
    remediation: "Run rea doctor through the production CLI adapter.",
});
const manualHopperPaths = async (home = homedir()) => {
    const paths = [];
    for (const root of ["/Applications", join(home, "Applications")]) {
        try {
            for (const entry of await readdir(root, { withFileTypes: true })) {
                if (entry.isDirectory() && /^Hopper.*\.app$/i.test(entry.name))
                    paths.push(join(root, entry.name, "Contents/MacOS/hopper"));
            }
        }
        catch (cause) {
            // A missing or unreadable optional application directory is not fatal.
            void cause;
        }
    }
    return paths;
};
const readInstalledSkill = (home) => readFile(join(home, ".agents/skills", PRODUCT_IDENTITY.skillName, "SKILL.md"), "utf8");
const installedSkillIdentity = async (home) => {
    try {
        const content = await readInstalledSkill(home);
        const countText = /^\s{2}tool_count:\s*(\d+)\s*$/mu.exec(content)?.[1];
        return {
            canonical: !(await canonicalSkillNeedsInstall(home)),
            version: /^\s{2}version:\s*"([^"]+)"\s*$/mu.exec(content)?.[1] ?? null,
            toolCount: countText === undefined ? null : Number.parseInt(countText, 10),
            catalogDigest: /^\s{2}catalog_digest:\s*"([a-f0-9]{64})"\s*$/mu.exec(content)?.[1] ??
                null,
        };
    }
    catch (cause) {
        // best-effort cleanup: optional skill probing; failure means unknown.
        void cause;
        return undefined;
    }
};
const uniqueLines = (value) => [
    ...new Set(value
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)),
];
const firstIlspyVersionLine = (value) => uniqueLines(value).find((line) => line.startsWith("ilspycmd:"));
