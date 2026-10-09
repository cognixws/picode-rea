// The extension's process. It
//   - turns the owner's settings into <data>/rea-env.json, which the MCP proxy
//     reads when an agent starts (an MCP server never sees the Host API);
//   - answers the page through PiCode's process relay: /check asks REA itself
//     (doctor and binary_session) what is ready.
// It never installs anything and never runs a target.
import http from "node:http";
import https from "node:https";
import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FAMILIES, statusOf } from "./families.mjs";
import { plainRemediation, reaEnv } from "./settings.mjs";

const env = process.env;
const pkg = dirname(dirname(fileURLToPath(import.meta.url)));
const reaEntry = join(pkg, "vendor/node_modules/rea-agents/scripts/rea.mjs");
const allowlist = JSON.parse(readFileSync(join(pkg, "tools/allowlist.json"), "utf8"));
const catalog = JSON.parse(readFileSync(join(pkg, "tools/catalog.json"), "utf8"));
const dataDir = env.PICODE_EXT_DATA || join(pkg, "../data");
const base = new URL(env.PICODE_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) throw new Error("PiCode Host API must use loopback.");
const log = (m) => console.error("[rea]", m);

// ---- settings → rea-env.json ----

function hostRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const target = new URL(path, base);
    const client = target.protocol === "https:" ? https : http;
    // PiCode's own certificate on loopback; nothing else is fetched here.
    const req = client.request(target, { method, rejectUnauthorized: false, headers: { "X-PiCode-Extension-Token": env.PICODE_EXT_TOKEN, "Content-Type": "application/json" } }, (res) => {
      const chunks = [];
      res.on("data", (b) => chunks.push(b));
      res.on("error", reject);
      res.on("end", () => {
        let parsed = {};
        try { parsed = JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch { parsed = { error: "unreadable answer" }; }
        if (res.statusCode >= 400) return reject(new Error(parsed.error || `Host API ${res.statusCode}`));
        resolve(parsed);
      });
    });
    req.setTimeout(30_000, () => req.destroy(new Error("Host API timeout")));
    req.on("error", reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

let settings = { profile: "core", env: {} };
async function loadSettings() {
  const r = await hostRequest("GET", "/api/ext/v1/settings");
  settings = reaEnv(r.values || {});
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, "rea-env.json");
  writeFileSync(file + ".tmp", JSON.stringify(settings, null, 2) + "\n", { mode: 0o600 });
  renameSync(file + ".tmp", file);
}

// ---- asking REA ----

// REA runs with the owner's environment minus PiCode's own credentials,
// plus the settings.
function reaEnvironment() {
  const out = {};
  for (const [k, v] of Object.entries(env)) if (!k.startsWith("PICODE_")) out[k] = v;
  return { ...out, ...settings.env };
}

function runREA(args, timeoutMs = 90_000) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [reaEntry, ...args], { stdio: ["ignore", "pipe", "pipe"], env: reaEnvironment(), cwd: dataDir });
    const out = [];
    const timer = setTimeout(() => { p.kill("SIGKILL"); reject(new Error(`REA did not answer in ${timeoutMs / 1000} s`)); }, timeoutMs);
    p.stdout.on("data", (b) => out.push(b));
    p.stderr.resume();
    p.on("error", (e) => { clearTimeout(timer); reject(e); });
    p.on("exit", (code) => { clearTimeout(timer); resolve({ code, stdout: Buffer.concat(out).toString() }); });
  });
}

async function doctor() {
  const r = await runREA(["doctor", "--json"]);
  const d = JSON.parse(r.stdout);
  // One entry per provider: usable or not, and the first check that failed
  // (the top-level "ghidra" check is only "the variable is set").
  const checks = {};
  for (const p of d.providerInspections || []) {
    const failed = (p.checks || []).find((c) => !c.ok);
    checks[p.id] = { ok: !!p.available, detail: failed?.detail || "", remediation: plainRemediation(failed?.remediation || failed?.detail || "") };
  }
  return checks;
}

// binary_session over REA's own MCP server: tool_availability for every tool.
function availability(timeoutMs = 90_000) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [reaEntry, "mcp"], { stdio: ["pipe", "pipe", "ignore"], env: reaEnvironment(), cwd: dataDir });
    const send = (m) => p.stdin.write(JSON.stringify(m) + "\n");
    const done = (fn, v) => { clearTimeout(timer); p.kill(); fn(v); };
    const timer = setTimeout(() => done(reject, new Error(`REA did not answer in ${timeoutMs / 1000} s`)), timeoutMs);
    let buf = "";
    p.on("error", (e) => done(reject, e));
    p.stdout.setEncoding("utf8");
    p.stdout.on("data", (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        let m;
        try { m = JSON.parse(line); } catch { continue; }
        if (m.id === 1) {
          send({ jsonrpc: "2.0", method: "notifications/initialized" });
          send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "binary_session", arguments: {} } });
        } else if (m.id === 2) {
          try {
            const r = m.result?.structuredContent?.result ?? JSON.parse(m.result.content[0].text).result;
            const out = {};
            for (const t of r.tool_availability) out[t.name] = { available: !!t.available, reason: t.reason, remediation: plainRemediation(t.remediation) };
            done(resolve, out);
          } catch (e) {
            done(reject, new Error("REA did not report its tools: " + e.message));
          }
        }
      }
    });
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "picode-rea-check", version: "1" } } });
  });
}

let last = null;
let running = null;
function check() {
  running ??= (async () => {
    const started = Date.now();
    try {
      const [checks, tools] = await Promise.all([doctor(), availability()]);
      const set = new Set(allowlist[settings.profile]);
      last = {
        checkedAt: new Date().toISOString(),
        tookMs: Date.now() - started,
        reaVersion: catalog.reaVersion,
        toolSet: settings.profile,
        toolCount: set.size,
        rows: FAMILIES.map((f) => statusOf(f, tools, checks, set)),
      };
    } catch (e) {
      log(`check failed: ${e.message}`);
      last = { checkedAt: new Date().toISOString(), reaVersion: catalog.reaVersion, toolSet: settings.profile, toolCount: allowlist[settings.profile].length, error: e.message, rows: [] };
    } finally {
      running = null;
    }
    return last;
  })();
  return running;
}

// ---- the page's relay ----

const equal = (a, b) => { const x = Buffer.from(a || ""), y = Buffer.from(b || ""); return x.length === y.length && timingSafeEqual(x, y); };
const server = http.createServer(async (req, res) => {
  const send = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  if (!equal(req.headers["x-picode-proxy-secret"], env.PICODE_EXT_PROXY_SECRET)) return send(403, { error: "Use the PiCode process relay." });
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/check" && req.method === "GET") return send(200, last ?? { checking: true, ...(await check()) });
    if (url.pathname === "/check" && req.method === "POST") return send(200, await check());
    send(404, { error: "Unknown request." });
  } catch (e) {
    send(500, { error: e.message });
  }
});

try {
  await loadSettings();
} catch (e) {
  log(`settings not read, using defaults: ${e.message}`);
}
server.listen(Number(env.PICODE_EXT_PORT), "127.0.0.1", () => void check());
