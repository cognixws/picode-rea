#!/usr/bin/env node
// picode-rea MCP proxy: starts the vendored REA MCP server unchanged and
// stands between it and the agent's CLI on stdio. It does two things only:
//
//   1. tools/list answers carry only the tools of the selected profile
//      (tools/allowlist.json: "core" by default, "static" on request);
//   2. a tools/call for any other tool is answered here, never forwarded.
//
// Everything else (initialize, notifications, server requests, results)
// passes through byte for byte. REA itself is not modified.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkg = dirname(dirname(fileURLToPath(import.meta.url)));
const reaEntry = join(pkg, "vendor/node_modules/rea-agents/scripts/rea.mjs");
const allowlist = JSON.parse(readFileSync(join(pkg, "tools/allowlist.json"), "utf8"));
const local = readLocalSettings();
const profile = process.env.PICODE_REA_PROFILE || local.profile || "core";
const allowed = new Set(profile === "static" ? allowlist.static : allowlist.core);
if (!allowlist[profile]) log(`unknown profile ${JSON.stringify(profile)}; using core`);

const child = spawn(process.execPath, [reaEntry, "mcp"], {
  stdio: ["pipe", "pipe", "inherit"],
  env: { ...process.env, ...local.env },
});
child.on("exit", (code, signal) => process.exit(signal ? 128 : (code ?? 0)));
child.on("error", (err) => {
  log(`could not start REA: ${err.message}`);
  process.exit(1);
});

const listIds = new Set();

lines(process.stdin, (line) => {
  const msg = parse(line);
  if (msg === undefined) return child.stdin.write(line + "\n");
  const out = [];
  for (const m of Array.isArray(msg) ? msg : [msg]) {
    if (m?.method === "tools/list" && m.id != null) listIds.add(key(m.id));
    if (m?.method === "tools/call" && m.id != null && !allowed.has(m.params?.name)) {
      reply(m.id, refusal(m.params?.name));
      continue;
    }
    out.push(m);
  }
  if (out.length === 0) return;
  child.stdin.write(JSON.stringify(Array.isArray(msg) ? out : out[0]) + "\n");
});
process.stdin.on("end", () => child.stdin.end());

lines(child.stdout, (line) => {
  const msg = parse(line);
  if (msg === undefined) return process.stdout.write(line + "\n");
  let changed = false;
  for (const m of Array.isArray(msg) ? msg : [msg]) {
    if (m?.id != null && listIds.delete(key(m.id)) && Array.isArray(m.result?.tools)) {
      m.result.tools = m.result.tools.filter((t) => allowed.has(t.name));
      changed = true;
    }
  }
  process.stdout.write((changed ? JSON.stringify(msg) : line) + "\n");
});

function refusal(name) {
  const why = Object.values(allowlist.withheld).some((group) =>
    Array.isArray(group) ? group.includes(name) : name in group,
  )
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

function key(id) {
  return typeof id + ":" + String(id);
}

function log(text) {
  process.stderr.write(`picode-rea: ${text}\n`);
}
