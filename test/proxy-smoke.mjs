// Smoke test of server/rea-mcp.mjs against the vendored REA, over stdio.
// Usage: node test/proxy-smoke.mjs [static-target.asar]
// Checks: the handshake answers before REA has started; the core list is the
// allowlist's core set; tools/catalog.json matches the live REA server; a
// withheld tool is refused by the proxy; with a target,
// analyze_javascript_application runs through to REA.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const pkg = dirname(dirname(fileURLToPath(import.meta.url)));
const allow = JSON.parse(readFileSync(join(pkg, "tools/allowlist.json"), "utf8"));
const catalog = JSON.parse(readFileSync(join(pkg, "tools/catalog.json"), "utf8"));
const p = spawn(process.execPath, [join(pkg, "server/rea-mcp.mjs")], { stdio: ["pipe", "pipe", "inherit"] });
let buf = "";
const pending = new Map();
let id = 0;
p.stdout.setEncoding("utf8");
p.stdout.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const m = JSON.parse(buf.slice(0, i));
    buf = buf.slice(i + 1);
    if (m.id != null && pending.has(m.id)) pending.get(m.id)(m), pending.delete(m.id);
  }
});
const rpc = (method, params) =>
  new Promise((r) => {
    const n = ++id;
    pending.set(n, r);
    p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n");
  });
const timer = setTimeout(() => (console.error("timeout"), process.exit(2)), 120000);

const t0 = Date.now();
await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "picode-rea-smoke", version: "0" } });
p.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
console.log(`ok   initialize after ${Date.now() - t0} ms`);
const list = await rpc("tools/list", {});
console.log(`ok   tools/list after ${Date.now() - t0} ms`);
const names = list.result.tools.map((t) => t.name).sort();
assert.deepEqual(names, [...allow.core].sort());
console.log(`ok   tools/list: ${names.length} core tools`);
assert.ok(Date.now() - t0 < 500, "the handshake waited for REA");

// The catalog the proxy answers from must be what this REA serves.
const live = await liveStaticTools();
assert.deepEqual(live, catalog.tools, "tools/catalog.json is stale: run scripts/catalog.mjs");
console.log(`ok   tools/catalog.json matches the live REA (${live.length} static tools)`);

const refused = await rpc("tools/call", { name: "capture_process_scenario", arguments: {} });
assert.equal(refused.result.isError, true);
assert.match(refused.result.content[0].text, /withholds/);
console.log("ok   capture_process_scenario refused by the proxy");

const target = process.argv[2];
if (target) {
  const r = await rpc("tools/call", { name: "analyze_javascript_application", arguments: { input_path: target } });
  const text = JSON.stringify(r.result ?? r.error);
  assert.ok(r.result && !r.result.isError, text.slice(0, 2000));
  console.log(`ok   analyze_javascript_application: ${text.length} bytes of evidence`);
  if (process.env.SMOKE_DUMP) (await import("node:fs")).writeFileSync(process.env.SMOKE_DUMP, text);
}
clearTimeout(timer);
p.kill();
process.exit(0);

function liveStaticTools() {
  return new Promise((resolve, reject) => {
    const r = spawn(process.execPath, [join(pkg, "vendor/node_modules/rea-agents/scripts/rea.mjs"), "mcp"], { stdio: ["pipe", "pipe", "ignore"] });
    let b = "";
    r.stdout.setEncoding("utf8");
    r.stdout.on("data", (d) => {
      b += d;
      let i;
      while ((i = b.indexOf("\n")) >= 0) {
        const m = JSON.parse(b.slice(0, i));
        b = b.slice(i + 1);
        if (m.id === 1) {
          r.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
          r.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n");
        } else if (m.id === 2) {
          r.kill();
          resolve(m.result.tools.filter((t) => allow.static.includes(t.name)));
        }
      }
    });
    r.on("error", reject);
    r.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "drift", version: "0" } } }) + "\n");
  });
}
