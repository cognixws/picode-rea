// The extension's settings (picode-extension.json) and the REA environment
// variable each one sets. The process writes the result to
// <data>/rea-env.json; server/rea-mcp.mjs reads it when an agent starts.

export const ENV = {
  provider: "REA_ANALYSIS_PROVIDER",
  ghidra_install_dir: "GHIDRA_INSTALL_DIR",
  java_home: "JAVA_HOME",
  ghidra_startup_timeout_ms: "REA_GHIDRA_STARTUP_TIMEOUT_MS",
  jadx_mcp_jar: "REA_JADX_MCP_JAR",
  wakaru_command: "REA_WAKARU_COMMAND",
  pwntools_python: "REA_PWNTOOLS_PYTHON",
  binwalk_command: "REA_BINWALK_COMMAND",
  unblob_command: "REA_UNBLOB_COMMAND",
  ida_mcp_config: "REA_IDA_MCP_CONFIG",
  hopper_launcher: "HOPPER_LAUNCHER_PATH",
};

// The labels the settings form shows, used to translate REA's remediation
// ("Set GHIDRA_INSTALL_DIR to …") into where the owner fixes it.
export const LABELS = {
  ghidra_install_dir: "Ghidra folder",
  java_home: "Java (JDK) folder",
  jadx_mcp_jar: "JADX MCP JAR",
  wakaru_command: "Wakaru command",
  pwntools_python: "Python with pwntools",
  binwalk_command: "Binwalk command",
  unblob_command: "Unblob command",
  ida_mcp_config: "IDA MCP registration",
  hopper_launcher: "Hopper launcher",
};

// rea-env.json from the saved values: the tool set and the environment.
export function reaEnv(values) {
  const env = {};
  for (const [key, name] of Object.entries(ENV)) {
    const v = values?.[key];
    if (v === undefined || v === null || v === "" || (key === "provider" && v === "auto")) continue;
    env[name] = String(v).trim();
  }
  return { profile: values?.tool_set === "static" ? "static" : "core", env };
}

// plainRemediation names the setting instead of the variable.
export function plainRemediation(text) {
  let out = String(text || "");
  for (const [key, name] of Object.entries(ENV)) {
    if (LABELS[key]) out = out.replaceAll(name, `“${LABELS[key]}” (Settings)`);
  }
  return out.replace(/Run rea setup to [^.]*\.\s*/g, "");
}
