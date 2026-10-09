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
| MCP server `rea` (Claude Code, Codex, OpenCode) | `server/rea-mcp.mjs` starts REA's own MCP server and filters it: only the tools of the selected set are listed, any other call is refused before it reaches REA. The handshake and the list are answered from `tools/catalog.json` in about 30 ms, so an agent's first turn already has the tools |
| Capability group `static` (all nine CLIs) | `server/execute.mjs` (picode-tools/1): `analyze-app`, `trace-feature`, `inspect-package`, `inspect-dotnet`, `inspect-android`, `inspect-capture`, `read-evidence`. Each call runs one whole REA workflow in a fresh session (PiCode allows 60 s and 4 MiB per call), saves REA's full Evidence bundle and answers a digest of a few KB |
| Skill `rea` (Pi, Omp, Claude Code) | Which tools exist and how to route a target to the first one, how to read large Evidence, where it is saved, and what is withheld. REA's own skill is not shipped: it tells agents to run `npx rea-agents@latest setup --yes` |
| Page **REA** (Apps tile, tab, phone More → Apps) | **Evidence**: bundles agents saved and the page's own analyses, each opened as groups (IPC channels, windows, modules… with file:line), summary, limitations and evidence IDs, plus **Send to agent** and **Open as artifact**. **What works here**: REA's own `doctor` and `binary_session` answers as Ready / Needs setup / Your license / Needs a Mac, one action per row |
| Open with ▸ **Analyse with REA** (`.asar`, `.apk`, `.exe`, `.dll`, `.har`) | A static analysis by the extension's process; the result opens on the page. A reopened page reuses the result while the file is unchanged |
| Settings | Tool set (core or full), disassembler, Ghidra and JDK folders, JADX JAR, Wakaru, pwntools, Binwalk/Unblob, and IDA/Hopper paths for the owner's own licenses. The process writes them to `data/rea-env.json`; agents started afterwards use them |

Permissions: `workspaces:read` (find each workspace's evidence folder),
`agents:read` (the Send list) and `messages:send` (Send to agent).
"Open as artifact" asks the chosen agent to publish a report: extensions
have no door to create an artifact themselves (ADR-0236/0249 give them read
and export only).

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

- **REA starts in 1.0–1.5 s; the first turn would miss it.** On the first
  scratch run, Codex logged `omitting pending optional MCP server
  server_name=rea` and Claude Code answered "still connecting" to a prompt
  given at launch. The proxy now answers `initialize` and `tools/list` from
  `tools/catalog.json`, recorded from this pinned REA by
  `scripts/catalog.mjs`. Calls wait until REA is up. The smoke test fails if
  the catalog and the live server disagree.

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
node scripts/catalog.mjs     # record REA's handshake and static tool list
node test/proxy-smoke.mjs /path/to/sample.asar
```

To move to a new REA version, change `vendor/package.json`, run
`npm install --package-lock-only --ignore-scripts` in `vendor/`, then
`scripts/vendor.sh` and `scripts/catalog.mjs`. The catalog script names any
tool `tools/allowlist.json` does not classify; such a tool is withheld until
it is.

## License

The extension is Apache-2.0. REA and every vendored package keep their own
licenses, under `vendor/node_modules/*/LICENSE*`. REA's license is MIT.

## Not done, and why

| Item | Why |
|---|---|
| "Install" opening a terminal | Extension pages have no terminal door (ADR-0230). The page copies the command instead; only the JDK on Ubuntu has a certain one |
| "Open as artifact" without an agent | No artifact-create door for extensions. The approved app-map work adds an extension-rendered artifact kind; a `rea-evidence` kind would replace the agent round trip |
| A review tab for `compare_application_versions` | Waits for the review-tab door being added for the app map |
| Native analysis in the capability group | Ghidra restarts per call and would not fit 60 s; native stays on the MCP server |
| Runtime tools (process, Electron, browser, native UI) | Not approved (F6) |
| Antigravity check | The scratch instance had no Antigravity sign-in; the other eight CLIs were checked live |
