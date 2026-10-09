#!/usr/bin/env node
// picode-rea MCP proxy: runs the vendored REA MCP server unchanged and stands
// between it and the agent's CLI on stdio.
//
//   1. The handshake and tools/list are answered at once from
//      tools/catalog.json (recorded from this same pinned REA by
//      scripts/catalog.mjs). REA takes 1–1.5 s to start, and Codex and
//      Claude Code build an agent's first turn without a server still pending.
//   2. tools/list carries only the selected set (tools/allowlist.json:
//      "core" by default, "static" on request).
//   3. A tools/call for any other tool is answered here and never reaches
//      REA. Allowed calls wait until REA is ready, then pass through.
//
// Every other message passes through unchanged. REA itself is not modified.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkg = dirname(dirname(fileURLToPath(import.meta.url)));
const reaEntry = join(pkg, "vendor/node_modules/rea-agents/scripts/rea.mjs");
const allowlist = readJSON("tools/allowlist.json");
const catalog = readJSON("tools/catalog.json");
const local = readLocalSettings();
let profile = process.env.PICODE_REA_PROFILE || local.profile || "core";
if (profile !== "core" && profile !== "static") {
  log(`unknown profile ${JSON.stringify(profile)}; using core`);
  profile = "core";
}
const allowed = new Set(allowlist[profile]);
const listed = catalog.tools.filter((t) => allowed.has(t.name));

const child = spawn(process.execPath, [reaEntry, "mcp"], {
  stdio: ["pipe", "pipe", "inherit"],
  env: { ...process.env, ...local.env },
});
child.on("exit", (code, signal) => process.exit(signal ? 128 : (code ?? 0)));
child.on("error", (err) => {
  log(`could not start REA: ${err.message}`);
  process.exit(1);
});

// Until REA has answered our own initialize, what the client sends waits here.
const INIT_ID = "picode-rea-init";
let ready = false;
const queue = [];

lines(process.stdin, (line) => {
  const msg = parse(line);
  if (msg === undefined || Array.isArray(msg)) return toREA(line);
  if (msg.method === "initialize" && msg.id != null) {
    const asked = msg.params?.protocolVersion;
    const protocolVersion = catalog.protocolVersions[asked] ?? catalog.fallbackVersion;
    reply(msg.id, { ...catalog.initialize, protocolVersion });
    child.stdin.write(JSON.stringify({ ...msg, id: INIT_ID }) + "\n");
    return;
  }
  if (msg.method === "tools/list" && msg.id != null) return reply(msg.id, { tools: listed });
  if (msg.method === "tools/call" && msg.id != null && !allowed.has(msg.params?.name)) {
    return reply(msg.id, refusal(msg.params?.name));
  }
  toREA(line);
});
process.stdin.on("end", () => (ready ? child.stdin.end() : queue.push(null)));

lines(child.stdout, (line) => {
  const msg = parse(line);
  if (msg?.id === INIT_ID) {
    if (msg.error) log(`REA refused initialize: ${JSON.stringify(msg.error)}`);
    ready = true;
    for (const q of queue.splice(0)) q === null ? child.stdin.end() : child.stdin.write(q + "\n");
    return;
  }
  // REA announcing a changed list would bypass the catalog: drop it, the
  // catalog is the pinned version's list.
  if (msg?.method === "notifications/tools/list_changed") return;
  process.stdout.write(line + "\n");
});

function toREA(line) {
  if (ready) child.stdin.write(line + "\n");
  else queue.push(line);
}

function refusal(name) {
  const withheld = Object.values(allowlist.withheld).some((group) =>
    Array.isArray(group) ? group.includes(name) : name in group,
  );
  const why = withheld
    ? "PiCode withholds it: it runs or attaches to the analysed target, which this extension does not allow."
    : `It is not in the "${profile}" tool set PiCode gave this agent.`;
  return {
    content: [{ type: "text", text: `REA tool ${JSON.stringify(name)} is not available here. ${why}` }],
    isError: true,
  };
}

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function readJSON(rel) {
  return JSON.parse(readFileSync(join(pkg, rel), "utf8"));
}

// Settings the extension's process wrote from PiCode's Settings form:
// <data>/extensions/<id>/data/rea-env.json, beside the package folder.
function readLocalSettings() {
  try {
    const s = JSON.parse(readFileSync(join(pkg, "../data/rea-env.json"), "utf8"));
    return { profile: s.profile, env: s.env && typeof s.env === "object" ? s.env : {} };
  } catch {
    return { env: {} };
  }
}

function lines(stream, onLine) {
  let buf = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, "");
      buf = buf.slice(i + 1);
      if (line.trim() !== "") onLine(line);
    }
  });
}

function parse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

function log(text) {
  process.stderr.write(`picode-rea: ${text}\n`);
}
