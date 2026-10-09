import { gt, valid } from "semver";
import { PRODUCT_IDENTITY } from "../identity.js";
/** Whether the update command left the requested release unapplied. */
export const isUpdateFailure = (result) => {
    const status = result.status;
    switch (status) {
        case "current":
        case "updated":
            return false;
        case "failed":
            return true;
        default: {
            const exhaustive = status;
            throw new TypeError(`Unhandled update result status: ${String(exhaustive)}`);
        }
    }
};
/** Resolve the exact npm command for the identified prefix and release. */
export const updateInstallCommand = (installation, version) => [
    "npm",
    "install",
    "--global",
    "--ignore-scripts",
    "--prefix",
    installation.prefix,
    `${PRODUCT_IDENTITY.packageName}@${version}`,
];
const versionCheckRemediation = (release) => {
    if (release.ok) {
        return "REA received invalid version metadata. Check the installed version and npm registry, then rerun rea update.";
    }
    const failure = release.error;
    const kind = failure.kind;
    switch (kind) {
        case "unavailable":
            return `REA could not resolve the latest release: ${failure.detail}. Retry rea update when registry access is available.`;
        case "invalid-metadata":
            return `REA could not resolve the latest release: ${failure.detail}. Check the npm release metadata, then rerun rea update.`;
        default: {
            const exhaustive = kind;
            throw new TypeError(`Unhandled release lookup failure: ${String(exhaustive)}`);
        }
    }
};
/** Identify, resolve, install, and verify REA without applying setup changes. */
export const runUpdate = async (currentVersion, host, output = "human") => {
    const installation = await host.installation();
    const release = await host.latestVersion(installation);
    const latestVersion = release.ok ? release.value : null;
    const targetVersion = release.ok ? valid(release.value) : null;
    if (!release.ok || valid(currentVersion) === null || targetVersion === null)
        return {
            status: "failed",
            currentVersion,
            latestVersion,
            reason: "version-check",
            remediation: versionCheckRemediation(release),
        };
    if (!gt(targetVersion, currentVersion))
        return {
            status: "current",
            currentVersion,
            latestVersion: targetVersion,
            installMethod: installation === undefined ? "unknown" : "npm",
        };
    if (installation === undefined)
        return {
            status: "failed",
            currentVersion,
            latestVersion: targetVersion,
            reason: "unknown-install-method",
            remediation: "Update this installation with the package manager or source checkout that owns it. For a one-off latest invocation, use npx rea-agents@latest.",
        };
    const installed = await host.installVersion(installation, targetVersion, output);
    if (!installed.ok)
        return {
            status: "failed",
            currentVersion,
            latestVersion: targetVersion,
            reason: "install",
            remediation: `REA could not install ${targetVersion} in ${installation.prefix}: ${installed.error}. Repair this npm installation, then rerun rea update.`,
        };
    const verified = await host.installedVersion(installation);
    if (!verified.ok || verified.value !== targetVersion)
        return {
            status: "failed",
            currentVersion,
            latestVersion: targetVersion,
            reason: "verification",
            ...(verified.ok ? { installedVersion: verified.value } : {}),
            remediation: `npm completed, but REA could not verify ${targetVersion} in ${installation.packageRoot}: ${verified.ok ? `the executable reported ${verified.value}` : verified.error}. The installation may have changed; repair it before retrying.`,
        };
    const maintenance = await host.planMaintenance(installation);
    return {
        status: "updated",
        previousVersion: currentVersion,
        latestVersion: targetVersion,
        installedVersion: verified.value,
        installMethod: "npm",
        command: updateInstallCommand(installation, targetVersion),
        maintenance,
        remediation: maintenance.status === "planned"
            ? "REA is updated. Run the maintenance command to review and approve changes to existing REA integrations, then restart affected agents."
            : maintenance.status === "unavailable"
                ? "REA is updated. Integration maintenance could not be planned; inspect the maintenance diagnostic before changing configuration."
                : "REA is updated. Restart agents running this installation to load the new version.",
    };
};
