import { parseClientConfiguration, serializeClientConfiguration, clientServerPath, legacyClientServerPath, withClientServers, } from "./ClientConfigurationDocument.js";
import { copyFile, lstat, readFile, realpath, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import writeFileAtomic from "write-file-atomic";
import { z } from "zod";
import { PRODUCT_IDENTITY } from "../identity.js";
import { isOwnedClientRegistrationCommand } from "./ClientRegistrationIdentity.js";
import { resolveClientConfigTransactionPath } from "./ClientConfigPath.js";
import { manualRegistrationRemediation, supportedClients, } from "./SupportedClients.js";
const systemFileSystem = {
    readText: (path) => readFile(path, "utf8"),
    copy: (source, destination) => copyFile(source, destination),
    writeText: (path, contents) => writeFileAtomic(path, contents, { encoding: "utf8" }),
    stat: (path) => lstat(path),
    realpath: (path) => realpath(path),
    remove: (path) => rm(path, { recursive: true }),
};
/** Whether any requested REA-owned uninstall action failed. */
export const isUninstallFailure = (result) => {
    const status = result.status;
    switch (status) {
        case "complete":
            return false;
        case "failed":
            return true;
        default: {
            const exhaustive = status;
            throw new TypeError(`Unhandled uninstall result status: ${String(exhaustive)}`);
        }
    }
};
/** Remove only REA-owned registrations and managed files, optionally including local state. */
export const runUninstall = async (purgeData, host = systemUninstallHost()) => {
    const items = [];
    for (const client of await host.clients())
        items.push(await host.removeClient(client));
    items.push(await host.removeSkill());
    if (purgeData)
        items.push(...(await host.purgeData()));
    items.push({
        name: "analysis_engine",
        status: "retained",
        detail: "Hopper is not owned by REA uninstall.",
    });
    return {
        status: items.some(({ status }) => status === "failed")
            ? "failed"
            : "complete",
        items,
    };
};
/** Create uninstall effects contained to detected client configs and REA-owned paths. */
export const systemUninstallHost = (home = homedir(), fileSystem = systemFileSystem) => ({
    clients: () => Promise.resolve(supportedClients(home)),
    removeClient: (client) => removeClient(client, fileSystem),
    removeSkill: () => removeManagedSkills(home, fileSystem),
    purgeData: async () => [
        await removeManagedPath(join(home, ".rea/cache"), "cache", fileSystem),
        await removeManagedPath(join(home, ".rea/state"), "state", fileSystem),
    ],
});
const removeClient = async (client, fileSystem) => {
    if (client.format === "unsupported")
        return item(client.name, "skipped", manualRegistrationRemediation(client.name) ??
            "This client has no documented local MCP configuration boundary.");
    const resolved = await resolveUninstallConfigPath(client, fileSystem);
    if (typeof resolved !== "string")
        return resolved;
    const transactionPath = resolved;
    let original;
    try {
        original = await fileSystem.readText(transactionPath);
    }
    catch (cause) {
        return isMissing(cause)
            ? item(client.name, "skipped", "Configuration does not exist.")
            : item(client.name, "failed", "Configuration could not be read. Check file permissions, then rerun uninstall.");
    }
    let parsed;
    try {
        parsed = parseClientConfiguration(original, client.format);
    }
    catch (cause) {
        void cause;
        return item(client.name, "failed", `Configuration is not valid ${client.format === "toml" || client.format === "grok" ? "TOML" : client.format === "opencode" ? "JSONC" : "JSON"} and was not changed. Repair it, then rerun uninstall.`);
    }
    const name = PRODUCT_IDENTITY.mcpServerKey;
    // Beside a native OpenCode V2 table, OpenCode also loads a V1 `mcp.rea`.
    const legacyPath = legacyClientServerPath(parsed, name);
    const hasNative = Object.hasOwn(parsed.servers, name);
    if (!hasNative && legacyPath === undefined)
        return item(client.name, "skipped", "REA registration is absent.");
    const removeNative = hasNative && isOwnedRegistration(parsed.servers[name], client);
    const removeLegacy = legacyPath !== undefined &&
        isOwnedRegistration(parsed.legacyServers[name], client);
    if (!removeNative && !removeLegacy)
        return item(client.name, "retained", "The rea-named registration is not REA-owned.");
    const remaining = { ...parsed.servers };
    if (removeNative)
        delete remaining[name];
    const document = withClientServers(parsed, remaining, removeLegacy ? name : undefined);
    const editedPaths = [
        ...(removeNative ? [clientServerPath(parsed, name)] : []),
        ...(removeLegacy ? [legacyPath] : []),
    ];
    const backupPath = `${client.configPath}.rea.backup`;
    try {
        await fileSystem.copy(transactionPath, backupPath);
    }
    catch (cause) {
        void cause;
        return item(client.name, "failed", "Configuration could not be backed up, so no change was made. Check file permissions, then rerun uninstall.");
    }
    try {
        await fileSystem.writeText(transactionPath, serializeClientConfiguration(document, client.format, original, editedPaths));
        const readback = parseClientConfiguration(await fileSystem.readText(transactionPath), client.format);
        if ((removeNative && Object.hasOwn(readback.servers, name)) ||
            (removeLegacy && Object.hasOwn(readback.legacyServers, name)))
            throw new Error("registration readback mismatch");
        return item(client.name, "removed", `Removed registration from ${client.configPath}.`);
    }
    catch (cause) {
        // Update failure attempts a restore before reporting; cause is preserved below.
        void cause;
        try {
            await fileSystem.writeText(transactionPath, original);
        }
        catch (restoreCause) {
            void restoreCause;
            return item(client.name, "failed", "Configuration could not be updated or restored. Restore its `.rea.backup` manually, then rerun uninstall.");
        }
        return item(client.name, "failed", "Configuration could not be updated. The original was restored and its `.rea.backup` was retained. Repair the configuration or restore the backup, then rerun uninstall.");
    }
};
const resolveUninstallConfigPath = async (client, fileSystem) => {
    const path = await resolveClientConfigTransactionPath(client.configPath, fileSystem.realpath === undefined
        ? { lstat: fileSystem.stat }
        : { lstat: fileSystem.stat, realpath: fileSystem.realpath });
    return (path ??
        item(client.name, "failed", "Configuration path could not be safely verified. Check its permissions and, if it is a symbolic link, verify that the link resolves to a regular file owned by the current user, then rerun uninstall."));
};
/** Ownership rule for persistent MCP registrations created by REA setup. */
const isOwnedRegistration = (value, client) => {
    if (client.format === "opencode") {
        const parsed = z
            .object({ type: z.literal("local"), command: z.array(z.string()).min(1) })
            .passthrough()
            .safeParse(value);
        if (!parsed.success)
            return false;
        const command = parsed.data.command;
        return isOwnedClientRegistrationCommand(command);
    }
    const parsed = registrationSchema.safeParse(value);
    if (!parsed.success)
        return false;
    const { command, args } = parsed.data;
    return isOwnedClientRegistrationCommand([command, ...args]);
};
const removeManagedPath = async (path, name, fileSystem) => {
    try {
        const stats = await fileSystem.stat(path);
        if (stats.isSymbolicLink())
            return item(name, "retained", "REA did not remove this item because its managed path is a symbolic link. Verify the link target before removing it manually.");
        await fileSystem.remove(path);
        return item(name, "removed", `Removed ${path}.`);
    }
    catch (cause) {
        return isMissing(cause)
            ? item(name, "skipped", `${path} does not exist.`)
            : item(name, "failed", "This item could not be removed. Check file permissions, then rerun uninstall.");
    }
};
const removeManagedSkills = async (home, fileSystem) => removeManagedPath(join(home, ".agents/skills", PRODUCT_IDENTITY.skillName), "skill", fileSystem);
const item = (name, status, detail) => ({ name, status, detail });
const registrationSchema = z
    .object({ command: z.string(), args: z.array(z.string()) })
    .passthrough();
const isMissing = (cause) => cause instanceof Error && "code" in cause && cause.code === "ENOENT";
