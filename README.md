# REA for PiCode

A PiCode extension that gives your agents **REA**
([morluto/rea](https://github.com/morluto/rea), MIT): reverse engineering of a
shipped app or file, from Electron routes and IPC down to native functions.
The extension wraps REA as it is. It does not fork or reimplement it: the npm
package `rea-agents` is pinned at **6.1.0** and vendored under
`vendor/node_modules`, so the code an agent runs is the code the owner
reviewed, bound to the extension's digest.

**Static tools only.** Nothing this extension exposes runs or attaches to the
analysed target. **REA is not a sandbox** (its own SECURITY.md says so): its
engines (Ghidra, JADX, …) parse the file with your user's permissions, so
analyse only files you trust. **Analysis results go to your agent's model
provider.**

| Part | What it does |
|---|---|
| MCP server `rea` (Claude Code, Codex, OpenCode) | `server/rea-mcp.mjs` starts REA's own MCP server and filters it: only the tools of the selected set are listed, any other call is refused before it reaches REA |
| Skill `rea` (Pi, Omp, Claude Code) | How to route a target to the first tool, how to read large Evidence, where to export it, and what is withheld |

## The tool sets

`tools/allowlist.json` holds both sets and the withheld tools, with the reason
for each group.

| Set | Tools | Definitions, about | Default |
|---|---|---|---|
| `core` | 27 | 13k tokens | yes |
| `static` | 108 | 104k tokens | opt-in (`PICODE_REA_PROFILE=static`) |
| REA unfiltered | 138 | 142k tokens | never |

Withheld, in every set:

- **Executes the target.** Process, Electron, browser and native UI
  scenarios, plus LLDB call observation and live page instrumentation. The
  owner has not approved these.
- **Attaches to a live app.** Browser, Electron and Node Inspector pages over
  CDP, and the native UI observation.
- **Compares runtime captures.** These need the withheld captures as input.
- **Hopper GUI cursor.** These need Hopper's GUI.

REA's `capabilities --json` also flags `launches_process` on tools such as
`inspect_artifact` and `inspect_plist`. Those launch REA's own helper
utilities (macOS `hdiutil`, `codesign`, `plutil`), never the target.

## F0 measurements (2026-10-09)

Measured with `HOME=$(mktemp -d)`, `BROWSER=/bin/false` and `env -i`, against
the vendored copy. Nothing touched the owner's CLI configs.

| What | Result |
|---|---|
| Version | `rea --version` → `6.1.0`, published 2026-10-09T01:16Z. Majors moved 4 → 5 → 6 in three days, hence the pin |
| Runtime | Node `^22.19 \|\| ^24.11 \|\| >=26`; measured on 24.11.1, Ubuntu 26.04 (WSL2) |
| MCP command | `node vendor/node_modules/rea-agents/scripts/rea.mjs mcp` (the package's `start` script); stdio, protocol 2025-06-18, server `rea 6.1.0` |
| `setup --dry-run --json` | `status: planned`, no actions with no CLI present. With `~/.claude` and `~/.codex` markers it reports both as `needs_configuration`. It knows 14 clients (claude_code, codex, opencode, antigravity, grok_build, …) but not Pi, Omp, Hermes or Muse |
| `doctor --json` | exit 1: Node and host healthy; Hopper, Ghidra (`GHIDRA_INSTALL_DIR` unset) and IDA (`REA_IDA_MCP_CONFIG` unset) missing; skill and registrations "config_drift" (expected: PiCode registers it, not `rea setup`) |
| `capabilities --json` | per-operation `available`, `availability_code`, `reason` and `effects` (launches_process, may_access_network, …); the Check page reads it |
| `tools/list` | 138 tools; JSON 2.18 MB, of which `outputSchema` 1.59 MB and `inputSchema` 0.51 MB. Name + description + input schema ≈ 569k chars ≈ 142k tokens (chars ÷ 4, an estimate) |
| Tool profile in REA | none (no env var or flag narrows the list), hence the filtering proxy |
| Vendored size | `npm ci --ignore-scripts --omit=dev`: 78.1 MB, 6,101 files, 16 links (over the installer's 64 MB / 5,000 files / no links). After `scripts/vendor.sh` prunes `.bin` links, source maps, type declarations and other packages' Markdown: **44.4 MB, 4,212 files, 0 links** |
| Install scripts | none needed: installed with `--ignore-scripts`, and the MCP server, CLI and a real analysis work |
| Native parts | `@lydell/node-pty` ships prebuilt binaries per platform; the vendored copy is Linux x64 (PiCode's daemon runs on Linux/WSL) |
| Static analysis | `analyze_javascript_application` on a 2.3 KB sample `.asar` (3 routes, 2 IPC channels): 141 ms; it found both channels, the preload bridge and the routes. The answer was **0.9 MB of text** plus the same again as structured content |

What follows from it:

- **Answers are large.** Agents must read `summary` first. The skill says so.
  Claude Code caps an MCP answer; REA's `REA_MCP_MAX_RESPONSE_BYTES` and
  `export_evidence_bundle` are its own way out.
- **`rea setup` is not used.** It would write the CLIs' own config files and
  install REA's upstream skill, which tells agents to run
  `npx rea-agents@latest setup --yes`. PiCode wires the MCP server per agent
  launch instead, and ships its own skill that forbids that.

## Rebuilding the vendored copy

```bash
scripts/vendor.sh            # npm ci from vendor/package-lock.json, then prune
node test/proxy-smoke.mjs /path/to/sample.asar
```

To move to a new REA version, change `vendor/package.json`, run
`npm install --package-lock-only --ignore-scripts` in `vendor/`, then
`scripts/vendor.sh`. Diff `tools/list` against `tools/allowlist.json`: a new
tool is withheld until it is classified.

## License

The extension is Apache-2.0. REA and every vendored package keep their own
licenses, under `vendor/node_modules/*/LICENSE*`. REA's license is MIT.
