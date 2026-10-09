import { isAbsolute, join } from "node:path";
import { lstatSync } from "node:fs";
const vscodeUserDirectory = ({ home, platform, env, }) => {
    if (platform === "win32")
        return join(env.APPDATA ?? join(home, "AppData", "Roaming"), "Code", "User");
    if (platform === "darwin")
        return join(home, "Library", "Application Support", "Code", "User");
    return join(env.XDG_CONFIG_HOME ?? join(home, ".config"), "Code", "User");
};
const claudeDesktopDirectory = ({ home, platform, env, }) => {
    if (platform === "win32")
        return join(env.APPDATA ?? join(home, "AppData", "Roaming"), "Claude");
    if (platform === "linux")
        return join(env.XDG_CONFIG_HOME ?? join(home, ".config"), "Claude");
    return join(home, "Library", "Application Support", "Claude");
};
const claudeCodeConfigDirectory = ({ home, env }) => env.CLAUDE_CONFIG_DIR ?? home;
const claudeCodeMarkerDirectory = ({ home, env }) => env.CLAUDE_CONFIG_DIR ?? join(home, ".claude");
const codexDirectory = ({ home, env }) => env.CODEX_HOME ?? join(home, ".codex");
const grokDirectory = ({ home, env }) => env.GROK_HOME ?? join(home, ".grok");
/** Grok Bot uses an absolute SAND_DATA_ROOT; anything else stays ~/.grokbot. */
const grokBotDirectory = ({ home, env }) => {
    const root = env.SAND_DATA_ROOT;
    return root !== undefined && root !== "" && isAbsolute(root)
        ? root
        : join(home, ".grokbot");
};
/**
 * Grok Bot stores connectors in the signed-in account and runs them on its
 * hosted computer. The data directory is only a detection marker.
 */
export const GROK_BOT_MANUAL_REGISTRATION_REMEDIATION = "Grok Bot keeps connectors in the signed-in account and runs them on its hosted computer. Setup does not write that account store, and a data-directory mcp.json is not a registration. In the Grok Bot chat, add a custom MCP server named rea that runs on the Bot's computer with `npx -y rea-agents@<version> mcp`. Do not put credentials in the command or arguments. A stdio server on this machine is not attached.";
/** Remediation for a client whose connector is not a local configuration file. */
export const manualRegistrationRemediation = (clientName) => clientName === "grok_bot"
    ? GROK_BOT_MANUAL_REGISTRATION_REMEDIATION
    : undefined;
const copilotDirectory = ({ home, env }) => env.COPILOT_HOME ?? join(home, ".copilot");
const commandCodeDirectory = ({ home }) => join(home, ".commandcode");
const opencodeDirectory = ({ home, env }) => join(env.XDG_CONFIG_HOME ?? join(home, ".config"), "opencode");
const existingOpenCodeConfigPath = (context) => {
    if (context.env.OPENCODE_CONFIG !== undefined)
        return context.env.OPENCODE_CONFIG;
    const directory = opencodeDirectory(context);
    const candidates = [
        "opencode.json",
        "opencode.jsonc",
        ".opencode.json",
        ".opencode.jsonc",
    ].map((filename) => join(directory, filename));
    return (candidates.find((path) => {
        try {
            lstatSync(path);
            return true;
        }
        catch (cause) {
            return !(cause instanceof Error &&
                "code" in cause &&
                cause.code === "ENOENT");
        }
    }) ??
        candidates[0] ??
        join(directory, "opencode.json"));
};
const devinDirectory = ({ home, platform, env }) => platform === "win32"
    ? join(env.APPDATA ?? join(home, "AppData", "Roaming"), "devin")
    : join(home, ".config", "devin");
/** Stable product metadata used to derive setup discovery and documentation. */
export const SUPPORTED_CLIENT_DEFINITIONS = [
    {
        name: "claude_code",
        displayName: "Claude Code",
        configPath: (context) => join(claudeCodeConfigDirectory(context), ".claude.json"),
        markerPath: claudeCodeMarkerDirectory,
        format: "json",
    },
    {
        name: "claude_desktop",
        displayName: "Claude Desktop",
        configPath: (context) => join(claudeDesktopDirectory(context), "claude_desktop_config.json"),
        markerPath: claudeDesktopDirectory,
        format: "json",
    },
    {
        name: "codex",
        displayName: "Codex",
        configPath: (context) => join(codexDirectory(context), "config.toml"),
        markerPath: codexDirectory,
        format: "toml",
    },
    {
        name: "cursor",
        displayName: "Cursor",
        configPath: [".cursor", "mcp.json"],
        markerPath: [".cursor"],
        format: "json",
    },
    {
        name: "gemini_cli",
        displayName: "Gemini CLI",
        configPath: [".gemini", "settings.json"],
        markerPath: [".gemini"],
        format: "json",
    },
    {
        name: "windsurf",
        displayName: "Windsurf",
        configPath: [".codeium", "windsurf", "mcp_config.json"],
        markerPath: [".codeium", "windsurf"],
        format: "json",
    },
    {
        name: "devin",
        displayName: "Devin",
        configPath: ({ home, platform, env }) => join(devinDirectory({ home, platform, env }), "mcp_config.json"),
        markerPath: devinDirectory,
        format: "json",
    },
    {
        name: "opencode",
        displayName: "OpenCode",
        configPath: existingOpenCodeConfigPath,
        markerPath: opencodeDirectory,
        format: "opencode",
    },
    {
        name: "antigravity",
        displayName: "Antigravity",
        configPath: [".gemini", "config", "mcp_config.json"],
        markerPath: [".gemini", "config"],
        format: "json",
    },
    {
        name: "copilot_cli",
        displayName: "GitHub Copilot CLI",
        configPath: (context) => join(copilotDirectory(context), "mcp-config.json"),
        markerPath: copilotDirectory,
        format: "copilot_cli",
    },
    {
        name: "commandcode",
        displayName: "Command Code",
        configPath: (context) => join(commandCodeDirectory(context), "mcp.json"),
        markerPath: commandCodeDirectory,
        format: "commandcode",
    },
    {
        name: "vscode",
        displayName: "VS Code",
        configPath: (context) => join(vscodeUserDirectory(context), "mcp.json"),
        markerPath: vscodeUserDirectory,
        format: "vscode",
    },
    {
        name: "grok_build",
        displayName: "Grok Build",
        configPath: (context) => join(grokDirectory(context), "config.toml"),
        markerPath: grokDirectory,
        format: "grok",
    },
    {
        name: "grok_bot",
        displayName: "Grok Bot",
        configPath: grokBotDirectory,
        markerPath: grokBotDirectory,
        format: "unsupported",
    },
];
const resolvePath = (path, context) => typeof path === "function" ? path(context) : join(context.home, ...path);
/** Describe every client location that setup, doctor, or uninstall may inspect. */
export const supportedClients = (home, platform = process.platform, env = {
    APPDATA: process.env.APPDATA,
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
    CODEX_HOME: process.env.CODEX_HOME,
    COPILOT_HOME: process.env.COPILOT_HOME,
    GROK_HOME: process.env.GROK_HOME,
    OPENCODE_CONFIG: process.env.OPENCODE_CONFIG,
    SAND_DATA_ROOT: process.env.SAND_DATA_ROOT,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
}) => {
    const context = { home, platform, env };
    return SUPPORTED_CLIENT_DEFINITIONS.map((definition) => ({
        name: definition.name,
        displayName: definition.displayName,
        configPath: resolvePath(definition.configPath, context),
        markerPath: resolvePath(definition.markerPath, context),
        format: definition.format,
    }));
};
