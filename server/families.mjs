// What the Check page shows: REA's targets grouped the way a person thinks of
// them, each with the tools that decide whether it is ready, the setting that
// fixes it and REA's own guide. Status comes from REA itself (binary_session's
// tool_availability and doctor), never from guessing here.

const GUIDE = "https://github.com/morluto/rea/blob/main/docs/";

export const FAMILIES = [
  {
    id: "javascript",
    title: "Electron and JavaScript apps",
    what: "Routes, IPC channels, preload bridges, modules and features of an .asar or an extracted app.",
    tools: ["analyze_javascript_application", "trace_application_feature"],
    guide: GUIDE + "javascript-application-workflows.md",
  },
  {
    id: "packages",
    title: "Archives and app packages",
    what: "Every file in a ZIP, APK, IPA, MSIX or DMG, with digests and integrity checks.",
    tools: ["inspect_artifact", "extract_artifact"],
    guide: GUIDE + "apple-application-analysis.md",
  },
  {
    id: "dotnet",
    title: ".NET assemblies",
    what: "Types, members, CIL and native boundaries of a managed DLL or EXE.",
    tools: ["inspect_managed_artifact", "inspect_managed_members"],
    guide: GUIDE + "managed-code-analysis.md",
  },
  {
    id: "captures",
    title: "Network captures",
    what: "Requests and responses saved in a HAR file or a mitmproxy capture.",
    tools: ["inspect_web_network_capture"],
    guide: GUIDE + "web-network-captures.md",
  },
  {
    id: "recovery",
    setup: "Install Wakaru 1.13.0, then enter its path under “Wakaru command” in Settings.",
    title: "Readable code from a bundle",
    what: "Split a minified JavaScript bundle back into modules (Wakaru).",
    tools: ["recover_javascript_sources"],
    settings: ["wakaru_command"],
    guide: GUIDE + "javascript-recovery.md",
  },
  {
    id: "android",
    setup: "Install a JDK and the jadx-headless-mcp 0.7.1 JAR, then enter the JAR’s path in Settings.",
    title: "Android apps",
    what: "Manifest, classes and decompiled methods of an APK (JADX and a JDK).",
    tools: ["inspect_android_package", "inspect_android_method"],
    settings: ["jadx_mcp_jar", "java_home"],
    command: { label: "Install a JDK (Ubuntu)", text: "sudo apt install openjdk-21-jdk" },
    guide: GUIDE + "android-analysis.md",
  },
  {
    id: "native",
    setup: "Download and unzip Ghidra 12.1, install a JDK 21 or newer, then enter Ghidra’s folder in Settings.",
    title: "Native programs and libraries",
    what: "Functions, strings, calls and pseudocode of an executable or library, with Ghidra.",
    tools: ["binary_overview", "procedure_pseudo_code"],
    doctor: "ghidra",
    settings: ["ghidra_install_dir", "java_home"],
    command: { label: "Install a JDK (Ubuntu)", text: "sudo apt install openjdk-21-jdk" },
    guide: GUIDE + "installation.md",
  },
  {
    id: "elf",
    setup: "Install pwntools 4.15.0 in a Python, then enter that Python’s path in Settings.",
    title: "Linux ELF layout and crash dumps",
    what: "Sections, symbols, relocations and mitigations of an ELF file; registers of a core dump (pwntools).",
    tools: ["inspect_binary_layout", "inspect_recorded_crash"],
    settings: ["pwntools_python"],
    guide: GUIDE + "binary-diagnostics.md",
  },
  {
    id: "firmware",
    setup: "Install Binwalk 3.1 or Unblob 26.6, then enter its path in Settings.",
    title: "Firmware images",
    what: "Regions and file systems inside a firmware image (Binwalk or Unblob).",
    tools: ["inspect_firmware_regions"],
    settings: ["binwalk_command", "unblob_command"],
    guide: GUIDE + "firmware-analysis.md",
  },
  {
    id: "evm",
    title: "Smart-contract bytecode",
    what: "Function selectors and arguments of EVM bytecode.",
    tools: ["inspect_evm_interface"],
    guide: GUIDE + "evm-bytecode.md",
  },
  {
    id: "licensed",
    title: "IDA Pro and Hopper",
    what: "Paid disassemblers. REA uses them when you have your own licensed install; PiCode never installs them.",
    doctor: ["ida", "hopper"],
    settings: ["ida_mcp_config", "hopper_launcher"],
    licensed: true,
    guide: GUIDE + "ida-provider.md",
  },
  {
    id: "apple",
    title: "Apple binaries and signatures",
    what: "Mach-O slices, code signatures and plists, with Apple's own tools.",
    tools: ["inspect_macho", "inspect_signature"],
    guide: GUIDE + "apple-application-analysis.md",
  },
];

// statusOf turns REA's answers into one row. availability maps a tool name
// to binary_session's entry; checks maps doctor's check name to its entry;
// set is the tool set agents get ("core" or "static" names).
export function statusOf(family, availability, checks, set) {
  const tools = family.tools ?? [];
  const entries = tools.map((t) => availability[t]).filter(Boolean);
  const inSet = tools.some((t) => set.has(t));
  const row = { id: family.id, title: family.title, what: family.what, guide: family.guide, settings: family.settings ?? [], command: family.command ?? null, inSet };

  if (family.licensed) {
    const names = { ida: "IDA Pro", hopper: "Hopper" };
    const ready = family.doctor.filter((d) => checks[d]?.ok).map((d) => names[d]);
    return { ...row, inSet: true, state: ready.length ? "ready" : "licensed", detail: ready.length ? `Using your ${ready.join(" and ")} install.` : "Needs your own licensed install. If you have one, add its path in Settings." };
  }
  if (entries.some((e) => e.reason === "unsupported_host")) {
    return { ...row, state: "unsupported", detail: "Works only on a Mac." };
  }
  // Our own plain sentence first; REA's remediation (written for a terminal
  // user) is kept as "rea" for whoever wants the exact requirement.
  const doctor = family.doctor ? checks[family.doctor] : null;
  if (doctor && !doctor.ok) {
    return { ...row, state: "missing", detail: family.setup || doctor.remediation || "Not set up.", rea: doctor.remediation || doctor.detail || "" };
  }
  const missing = entries.find((e) => !e.available && e.reason !== "target_required");
  if (missing) return { ...row, state: "missing", detail: family.setup || missing.remediation || "Not set up.", rea: missing.remediation || "" };
  if (!entries.length && !doctor) return { ...row, state: "unknown", detail: "REA did not report on it." };
  return { ...row, state: "ready", detail: "" };
}
