import {} from "../application/AnalysisProvider.js";
import { createAnalysisProfile, } from "../domain/analysisProfile.js";
import { jsonObjectSchema, jsonValueSchema, } from "../domain/jsonValue.js";
import { ok } from "../domain/result.js";
import { GhidraClient } from "./GhidraClient.js";
import { ghidraInstallationDiagnostics, inspectGhidraInstallation, } from "./GhidraInstallation.js";
import { resolveGhidraAnalysisProfile } from "./GhidraAnalysisProfile.js";
import { resolveGhidraExtensions } from "./extensions/GhidraExtensions.js";
import { CAPABILITIES, windowsP0Capabilities, GHIDRA_PROVIDER_IDENTITY, GHIDRA_OPERATIONS, } from "./GhidraProviderCapabilities.js";
import { createGhidraProviderClient, } from "./GhidraProviderClient.js";
import { windowsNativeAuthorityUnavailableReason, hasWindowsNativeAuthority, windowsNativeCapabilities, } from "../process/WindowsAuthority.js";
export { GHIDRA_PROVIDER_IDENTITY, GHIDRA_OPERATIONS };
const SUPPORTED_ARCHITECTURES = new Set(["x86", "x86_64", "arm", "arm64"]);
/** Ghidra candidate backed by an isolated ephemeral headless import. */
export class GhidraProvider {
    config;
    logger;
    installationHost;
    clientFactory;
    #installation;
    constructor(config, logger, installationHost, clientFactory = (options) => new GhidraClient(options)) {
        this.config = config;
        this.logger = logger;
        this.installationHost = installationHost;
        this.clientFactory = clientFactory;
    }
    identity() {
        return GHIDRA_PROVIDER_IDENTITY;
    }
    capabilities() {
        return (this.installationHost?.platform ?? process.platform) === "win32"
            ? windowsP0Capabilities()
            : CAPABILITIES;
    }
    inspectAvailability() {
        const installation = this.#inspectInstallation();
        const diagnostics = ghidraInstallationDiagnostics(installation);
        if (installation.status === "available" &&
            installation.platform === "win32" &&
            !hasWindowsNativeAuthority(installation.platform))
            return {
                status: "unavailable",
                code: "unsupported_host",
                reason: windowsNativeAuthorityUnavailableReason(installation.platform),
                diagnostics: {
                    ...diagnostics,
                    windows_security: jsonObjectSchema.parse(windowsNativeCapabilities(installation.platform)),
                },
            };
        return installation.status === "available"
            ? {
                status: "available",
                code: null,
                reason: null,
                diagnostics,
            }
            : {
                status: "unavailable",
                code: installation.rejection.code,
                reason: installation.rejection.reason,
                diagnostics,
            };
    }
    inspectTargetSupport(target) {
        const hostPlatform = this.installationHost?.platform ?? process.platform;
        const diagnostics = {
            host_platform: hostPlatform,
            target_kind: target.kind,
            target_format: target.format,
            architecture: target.architecture ?? null,
            available_architectures: target.kind === "executable"
                ? [...target.availableArchitectures]
                : null,
            executable_role: target.executableRole ?? null,
            managed: target.managed ?? null,
        };
        if (target.kind !== "executable")
            return {
                status: "unsupported",
                code: "target_kind_unsupported",
                reason: `Ghidra v1 imports executable targets, not ${target.kind} targets.`,
                diagnostics,
            };
        if (hostPlatform === "win32")
            return inspectWindowsP0TargetSupport(target, diagnostics);
        if (target.format === "mach-o" && target.availableArchitectures.length > 1)
            return {
                status: "unsupported",
                code: "architecture_unsupported",
                reason: "Ghidra v1 cannot enforce the selected architecture when importing a universal Mach-O; analyze a thinned Mach-O slice instead.",
                diagnostics,
            };
        if (!SUPPORTED_ARCHITECTURES.has(target.architecture))
            return {
                status: "unsupported",
                code: "architecture_unsupported",
                reason: "Ghidra v1 requires a concrete x86, x86_64, arm, or arm64 target architecture.",
                diagnostics,
            };
        return {
            status: "supported",
            code: null,
            reason: null,
            diagnostics,
        };
    }
    async resolveAnalysisProfile(target, options) {
        const installation = this.#inspectInstallation();
        const resolved = await resolveGhidraAnalysisProfile(target, GHIDRA_PROVIDER_IDENTITY, installation, options?.signal);
        if (!resolved.ok || resolved.value.profile === null)
            return resolved;
        const extensions = await resolveGhidraExtensions(this.config, target, installation.platform, options?.signal);
        if (!extensions.ok)
            return extensions;
        if (extensions.value.length === 0)
            return resolved;
        return ok({
            ...resolved.value,
            profile: createAnalysisProfile(resolved.value.profile.provider, {
                ...resolved.value.profile.parameters,
                analysis_extensions: jsonValueSchema.parse(extensions.value),
            }),
        });
    }
    createClient(target, profile, context) {
        return createGhidraProviderClient({
            config: this.config,
            logger: this.logger,
            clientFactory: this.clientFactory,
            target,
            ...(profile === undefined ? {} : { profile }),
            ...(context === undefined ? {} : { context }),
            installation: this.#inspectInstallation(),
        });
    }
    #inspectInstallation() {
        const options = {
            ...(this.config.ghidraInstallDir === undefined
                ? {}
                : { installDir: this.config.ghidraInstallDir }),
            ...(this.config.ghidraJavaHome === undefined
                ? {}
                : { javaHome: this.config.ghidraJavaHome }),
            ...(this.installationHost?.platform === undefined
                ? {}
                : { platform: this.installationHost.platform }),
            ...(this.installationHost?.architecture === undefined
                ? {}
                : { architecture: this.installationHost.architecture }),
        };
        this.#installation ??=
            this.installationHost === undefined
                ? inspectGhidraInstallation(options)
                : inspectGhidraInstallation(options, this.installationHost);
        return this.#installation;
    }
}
const inspectWindowsP0TargetSupport = (target, diagnostics) => {
    if (target.format !== "pe")
        return {
            status: "unsupported",
            code: "target_format_unsupported",
            reason: "Windows Ghidra P0 accepts PE targets only.",
            diagnostics,
        };
    if (target.architecture !== "x86" && target.architecture !== "x86_64")
        return {
            status: "unsupported",
            code: "architecture_unsupported",
            reason: "Windows Ghidra P0 accepts x86 and x86-64 PE targets only.",
            diagnostics,
        };
    if (target.executableRole !== "application")
        return {
            status: "unsupported",
            code: "target_role_unsupported",
            reason: "Windows Ghidra P0 accepts PE applications, not DLL or non-executable images.",
            diagnostics,
        };
    if (target.managed !== false)
        return {
            status: "unsupported",
            code: "managed_target_unsupported",
            reason: "Windows Ghidra P0 accepts native PE applications; managed or unclassified PE targets are unsupported.",
            diagnostics,
        };
    return {
        status: "supported",
        code: null,
        reason: null,
        diagnostics,
    };
};
