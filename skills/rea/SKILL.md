---
name: rea
description: Reverse engineer a shipped app or file with REA's static tools in PiCode — an Electron/ASAR or JavaScript bundle, an APK, a .NET assembly, a native binary (with Ghidra), an archive or a HAR capture — to learn how an existing app does something (routes, IPC, screens, functions). Skip it for a source repository you can just read.
---

# REA in PiCode

REA (morluto/rea, MIT) turns a shipped app or file into Evidence: graphs,
routes, IPC channels, classes, functions, with IDs, limitations and unknowns.
PiCode gives you REA's **static** tools only. Nothing you call here runs or
attaches to the analysed target.

## Where the tools are

- Claude Code, Codex, OpenCode: the MCP server `rea` (tool names such as
  `analyze_javascript_application`, `open_binary`, `inspect_android_package`).
- Pi, Omp, Grok, Hermes, Muse, Antigravity: the `rea` capability tools that
  PiCode lists for this launch, when the owner turned them on for you.

If none are there, the owner has not given them to this agent. Say so and
stop. **Never** run `rea setup`, `npx rea-agents…` or edit a CLI's MCP config
yourself: PiCode installs a pinned, reviewed REA and wires it per agent.

## Route the target

| Target | First tool |
|---|---|
| `.asar` or an extracted Electron/JS app | `analyze_javascript_application` (`input_path`) |
| Feature question about that app ("how does it save notes?") | then `trace_application_feature` |
| Minified bundle you want readable | `recover_javascript_sources` |
| ZIP / APK / IPA / MSIX / DMG member inventory | `open_binary`, then `inspect_artifact` |
| APK code | `inspect_android_package`, then `search_android_classes`, `inspect_android_class`, `inspect_android_method` |
| .NET assembly | `inspect_managed_artifact`, then `inspect_managed_members` |
| Native executable or library | `open_binary`, then `search_strings`, `search_procedures`, `analyze_function`, `procedure_pseudo_code`, `xrefs`, `get_call_graph` (needs Ghidra) |
| Linux ELF layout | `inspect_binary_layout` |
| HAR or mitmproxy capture | `inspect_web_network_capture` |

A tool answering "missing engine" (Ghidra, JADX, Java…) means the owner has
not installed it: tell them to open **Extensions ▸ REA ▸ Check**, and carry on
with what works.

## Work summary-first

- Results are large (a tiny Electron app answered about 0.9 MB). Read the
  `summary`, `statistics` and `limitations` first; follow up with a focused
  tool only for a specific gap. Never repeat an identical call.
- Separate observations, inferences and unknowns in your answer and cite
  Evidence IDs. Static analysis never observed the app running: do not say
  it did.
- To keep the evidence for the owner, call `export_evidence_bundle` with an
  absolute path `<workspace folder>/.rea/evidence/<short-name>.json`. The
  REA page in PiCode lists that folder for every workspace.

## What is not available, on purpose

Runtime tools — process, Electron, browser and native UI scenarios, live
CDP or Inspector attachment, LLDB call observation — run or attach to the
target. The owner has not approved them; the server refuses them. Do not
look for a way around that, and do not run the target yourself to
compensate. Analyse only files the owner gave you or that you may lawfully
analyse.

## References (from REA, unchanged)

- `references/javascript-applications.md`
- `references/android-applications.md`
- `references/evidence-workflows.md`
