#!/usr/bin/env node
// Record what the vendored REA answers to the MCP handshake, so the proxy can
// answer it at once while REA itself is still starting (about 1–1.5 s; Codex
// and Claude Code build an agent's first turn without a server that is still
// pending). Writes tools/catalog.json:
//
//   initialize        REA's initialize result, protocolVersion left out
//   protocolVersions  requested version → the version REA negotiated
//   fallbackVersion   what REA answers to a version it does not know
//   tools             REA's tools/list entries for the "static" set
//
// The pin makes this exact; test/proxy-smoke.mjs fails when the live server
// and the catalog disagree. Run it again after changing the REA version.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkg = dirname(dirname(fileURLToPath(import.meta.url)));
const rea = join(pkg, "vendor/node_modules/rea-agents/scripts/rea.mjs");
const allow = JSON.parse(readFileSync(join(pkg, "tools/allowlist.json"), "utf8"));
const asked = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05", "2024-10-07", "1999-01-01"];

const protocolVersions = {};
let initialize, tools, fallbackVersion;
for (const version of asked) {
  const { init, list } = await session(version, version === asked[0]);
  const { protocolVersion, ...rest } = init;
  if (version === "1999-01-01") fallbackVersion = protocolVersion;
  else protocolVersions[version] = protocolVersion;
  initialize ??= rest;
  if (JSON.stringify(rest) !== JSON.stringify(initialize)) throw new Error(`initialize differs for ${version}`);
  if (list) tools = list;
}
const known = new Set(tools.map((t) => t.name));
const missing = allow.static.filter((n) => !known.has(n));
if (missing.length) throw new Error(`allowlisted tools REA does not serve: ${missing.join(", ")}`);
const unclassified = [...known].filter(
  (n) => !allow.static.includes(n) && !Object.values(allow.withheld).some((g) => (Array.isArray(g) ? g.includes(n) : n in g)),
);
if (unclassified.length) console.error(`withheld until classified: ${unclassified.join(", ")}`);
const out = {
  reaVersion: initialize.serverInfo?.version,
  initialize,
  protocolVersions,
  fallbackVersion,
  tools: tools.filter((t) => allow.static.includes(t.name)),
};
writeFileSync(join(pkg, "tools/catalog.json"), JSON.stringify(out) + "\n");
console.log(`tools/catalog.json: REA ${out.reaVersion}, ${out.tools.length} static tools, versions ${JSON.stringify(protocolVersions)}, fallback ${fallbackVersion}`);

function session(protocolVersion, withList) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [rea, "mcp"], { stdio: ["pipe", "pipe", "ignore"] });
    const timer = setTimeout(() => (p.kill(), reject(new Error("REA did not answer in 60 s"))), 60000);
    let buf = "";
    let init;
    const send = (m) => p.stdin.write(JSON.stringify(m) + "\n");
    p.stdout.setEncoding("utf8");
    p.stdout.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const m = JSON.parse(buf.slice(0, i));
        buf = buf.slice(i + 1);
        if (m.id === 1) {
          if (m.error) return reject(new Error(JSON.stringify(m.error)));
          init = m.result;
          if (!withList) return finish({ init });
          send({ jsonrpc: "2.0", method: "notifications/initialized" });
          send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
        } else if (m.id === 2) {
          if (m.result.nextCursor) return reject(new Error("paged tools/list is not handled"));
          finish({ init, list: m.result.tools });
        }
      }
    });
    function finish(v) {
      clearTimeout(timer);
      p.kill();
      resolve(v);
    }
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion, capabilities: {}, clientInfo: { name: "picode-rea-catalog", version: "0" } } });
  });
}
