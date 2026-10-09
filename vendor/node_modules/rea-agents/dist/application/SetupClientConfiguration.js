import { clientRegistrationEntry, clientConfigurationValuesEqual, clientServerPath, grokServerListedDisabled, legacyClientServerPath, parseClientConfiguration, serializeClientConfiguration, withClientServers, } from "./ClientConfigurationDocument.js";
import { constants as fsConstants } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import writeFileAtomic from "write-file-atomic";
import { PRODUCT_IDENTITY } from "../identity.js";
import { npxRegistrationCommand } from "./ClientRegistrationIdentity.js";
import { MCP_STARTUP_POLICY } from "../mcpStartupPolicy.js";
import { resolveClientConfigTransactionPath } from "./ClientConfigPath.js";
const defaultCommand = () => npxRegistrationCommand();
/** Configure one supported client's native stdio MCP registration shape. */
export const configureClientConfiguration = (client, environment = {}, command = defaultCommand()) => {
    if (client.format === undefined || client.format === "unsupported")
        return Promise.resolve({ status: "failed", reason: "readback" });
    return configureClientDocument(client, environment, command, client.format);
};
const configureClientDocument = async (client, environment, command, format) => {
    const transactionPath = await resolveClientConfigTransactionPath(client.configPath);
    if (transactionPath === undefined)
        return { status: "failed", reason: "path" };
    let original;
    try {
        original = await readFile(transactionPath, "utf8");
    }
    catch (cause) {
        if (!isMissing(cause))
            return { status: "failed", reason: "readback" };
    }
    let parsed;
    try {
        parsed = parseClientConfiguration(original ?? (format === "toml" || format === "grok" ? "" : "{}"), format);
    }
    catch (cause) {
        // Malformed existing configuration fails the readback gate.
        void cause;
        return { status: "failed", reason: "readback" };
    }
    const desired = clientConfigurationDesired(client, environment, command, parsed.dialect);
    if (registrationCurrent(parsed, desired))
        return { status: "unchanged" };
    const backupPath = original === undefined ? undefined : `${client.configPath}.rea.backup`;
    if (backupPath !== undefined &&
        !(await preserveConfigBackup(transactionPath, backupPath)))
        return { status: "failed", reason: "backup" };
    // A native OpenCode V2 entry replaces REA's legacy V1 entry, which would
    // otherwise conflict with it.
    const legacyPath = legacyClientServerPath(parsed, PRODUCT_IDENTITY.mcpServerKey);
    const document = withClientServers(parsed, { ...parsed.servers, [PRODUCT_IDENTITY.mcpServerKey]: desired }, PRODUCT_IDENTITY.mcpServerKey);
    try {
        await mkdir(dirname(client.configPath), { recursive: true });
        await writeFileAtomic(transactionPath, serializeClientConfiguration(document, format, original, [
            clientServerPath(parsed, PRODUCT_IDENTITY.mcpServerKey),
            ...(legacyPath === undefined ? [] : [legacyPath]),
        ]), {
            encoding: "utf8",
            mode: 0o600,
        });
    }
    catch (cause) {
        // Write failure is reported by the status reason.
        void cause;
        return { status: "failed", reason: "write" };
    }
    try {
        const readback = parseClientConfiguration(await readFile(transactionPath, "utf8"), format);
        if (!registrationCurrent(readback, desired)) {
            await restoreConfig(transactionPath, original);
            return { status: "failed", reason: "readback" };
        }
    }
    catch (cause) {
        // Readback failure restores the transaction before reporting.
        void cause;
        await restoreConfig(transactionPath, original);
        return { status: "failed", reason: "readback" };
    }
    return {
        status: "configured",
        ...(backupPath === undefined ? {} : { backupPath }),
    };
};
/** Determine whether an existing client configuration matches the desired registration. */
export const clientConfigurationAligned = async (client, providerEnvironment, command) => {
    try {
        const original = await readFile(client.configPath, "utf8");
        const parsed = parseClientConfiguration(original, client.format);
        return registrationCurrent(parsed, clientConfigurationDesired(client, providerEnvironment, command, parsed.dialect));
    }
    catch (cause) {
        // Unreadable configuration is treated as not aligned so setup repairs it.
        void cause;
        return false;
    }
};
/** Preflight one client configuration before setup presents any mutations. */
export const inspectClientConfiguration = async (client, providerEnvironment, command) => {
    if (client.format === "unsupported")
        return { status: "already_current" };
    const transactionPath = await resolveClientConfigTransactionPath(client.configPath);
    if (transactionPath === undefined)
        return {
            status: "invalid",
            remediation: "The configuration path is unsafe or unresolved. Check ownership and symbolic links before rerunning setup.",
        };
    let original;
    try {
        original = await readFile(transactionPath, "utf8");
    }
    catch (cause) {
        if (isMissing(cause))
            return { status: "create" };
        return {
            status: "invalid",
            remediation: "The configuration file could not be read. Check its permissions before rerunning setup.",
        };
    }
    try {
        const parsed = parseClientConfiguration(original, client.format);
        const desired = clientConfigurationDesired(client, providerEnvironment, command, parsed.dialect);
        if (registrationCurrent(parsed, desired))
            return { status: "already_current" };
    }
    catch (cause) {
        // Malformed configuration is reported with the invalid remediation.
        void cause;
        return {
            status: "invalid",
            remediation: "The existing configuration is malformed. Repair it before setup applies any other changes.",
        };
    }
    return {
        status: "update",
        backupPath: `${client.configPath}.rea.backup`,
    };
};
const isMissing = (cause) => cause instanceof Error && "code" in cause && cause.code === "ENOENT";
const preserveConfigBackup = async (source, destination) => {
    try {
        await copyFile(source, destination, fsConstants.COPYFILE_EXCL);
        return true;
    }
    catch (cause) {
        return cause instanceof Error && "code" in cause && cause.code === "EEXIST";
    }
};
const restoreConfig = async (path, original) => {
    try {
        if (original === undefined)
            await rm(path, { force: true });
        else
            await writeFile(path, original, { encoding: "utf8", mode: 0o600 });
    }
    catch (cause) {
        // The backup remains available for the remediation reported by setup.
        void cause;
    }
};
/** Whether REA's entry matches, no legacy entry remains, and Grok is not suppressing it. */
const registrationCurrent = (parsed, desired) => clientConfigurationValuesEqual(parsed.servers[PRODUCT_IDENTITY.mcpServerKey], desired) &&
    !Object.hasOwn(parsed.legacyServers, PRODUCT_IDENTITY.mcpServerKey) &&
    !(parsed.dialect === "grok" &&
        grokServerListedDisabled(parsed.document, PRODUCT_IDENTITY.mcpServerKey));
const clientConfigurationDesired = (client, providerEnvironment, command, format) => {
    const environment = Object.fromEntries(Object.entries(providerEnvironment).sort(([left], [right]) => left.localeCompare(right)));
    const registration = clientRegistrationEntry(format ?? "json", command.length === 0 ? [PRODUCT_IDENTITY.cliBinary, "mcp"] : command, environment);
    return {
        ...registration,
        ...(client.name === "codex" || client.name === "grok_build"
            ? {
                startup_timeout_sec: MCP_STARTUP_POLICY.codexStartupTimeoutSeconds,
            }
            : {}),
    };
};
