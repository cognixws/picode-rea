// Smoke test of server/rea-mcp.mjs against the vendored REA, over stdio.
// Usage: node test/proxy-smoke.mjs [static-target.asar]
// Checks: the core list is the allowlist's core set; a withheld tool is
// refused by the proxy; with a target, analyze_javascript_application runs.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const pkg = dirname(dirname(fileURLToPath(import.meta.url)));
const allow = JSON.parse(readFileSync(join(pkg, "tools/allowlist.json"), "utf8"));
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

await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "picode-rea-smoke", version: "0" } });
p.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
const list = await rpc("tools/list", {});
const names = list.result.tools.map((t) => t.name).sort();
assert.deepEqual(names, [...allow.core].sort());
console.log(`ok   tools/list: ${names.length} core tools`);

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
