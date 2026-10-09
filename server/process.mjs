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
import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FAMILIES, statusOf } from "./families.mjs";
import { plainRemediation, reaEnv } from "./settings.mjs";
import { evidenceDirs, listBundles, outputFor, planFor, readBundle, resolveBundle, targetPath } from "./evidence.mjs";
import { withREA } from "./mcp-client.mjs";

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

// ---- evidence ----

async function workspaces() {
  const r = await hostRequest("GET", "/api/ext/v1/workspaces");
  return r.workspaces || [];
}

async function dirs() {
  return evidenceDirs(await workspaces(), dataDir);
}

// One analysis at a time per file; the page polls /evidence for the result.
const analyses = new Map(); // target path → { state, error, id, startedAt }

async function analyze({ path, workspaceId }) {
  // Open with names the file and, when it knows it, the workspace; else the
  // workspace is the one whose folder holds the file.
  const on = (await workspaces()).filter((w) => w.extensionOn);
  const ws = on.find((w) => w.id === workspaceId) || (!workspaceId && on.find((w) => w.path && targetPath(path, w)));
  if (!ws) throw Object.assign(new Error("Turn REA on in this file's workspace first."), { status: 409 });
  const target = targetPath(path, ws);
  if (!target) throw Object.assign(new Error("That file is outside the workspace folder."), { status: 400 });
  const plan = planFor(target);
  if (!plan) throw Object.assign(new Error("REA has no static analysis for this kind of file here. Ask an agent with REA instead."), { status: 400 });
  const running = analyses.get(target);
  if (running?.state === "running") return { target, ...running };
  // A reopened page replays its Open with context: reuse the newest result
  // made after the file last changed instead of analysing again.
  const fresh = latestFor(ws.id, target);
  if (fresh) {
    const done = { state: "done", id: Buffer.from(fresh).toString("base64url"), workspaceId: ws.id, reused: true };
    analyses.set(target, done);
    return { target, ...done };
  }
  const job = { state: "running", startedAt: new Date().toISOString(), workspaceId };
  analyses.set(target, job);
  const out = outputFor(dataDir, ws.id, target);
  withREA({ entry: reaEntry, env: reaEnvironment(), cwd: dataDir }, async ({ call }) => {
    for (const [tool, args] of plan) await call(tool, args);
    await call("export_evidence_bundle", { path: out });
  }).then(
    () => { job.state = "done"; job.id = Buffer.from(out).toString("base64url"); },
    (e) => { job.state = "failed"; job.error = e.message; log(`analysis of ${target} failed: ${e.message}`); },
  );
  return { target, ...job };
}

function latestFor(wsId, target) {
  let changed;
  try { changed = statSync(target).mtimeMs; } catch { return null; }
  const dir = join(dataDir, "evidence", wsId);
  const prefix = basename(target).replace(/[^\w.-]+/g, "_") + "-";
  let best = null;
  for (const name of (() => { try { return readdirSync(dir); } catch { return []; } })()) {
    if (!name.startsWith(prefix) || !name.endsWith(".json") || name.endsWith(".agent.json")) continue;
    const st = statSync(join(dir, name));
    if (st.mtimeMs >= changed && (!best || st.mtimeMs > best.t)) best = { t: st.mtimeMs, path: join(dir, name) };
  }
  return best?.path ?? null;
}

async function sendToAgent({ id, agentId, publish }) {
  const found = resolveBundle(id, await dirs());
  if (!found) throw Object.assign(new Error("That evidence file is gone."), { status: 404 });
  const b = readBundle(found.path);
  const ops = [...new Set(b.records.map((r) => r.operation))].join(", ");
  const target = b.records.find((r) => r.target.path)?.target.path || "";
  const lines = [
    `REA evidence from the REA page: ${found.path}`,
    `${b.records.length} record(s) (${ops})${target ? ` on ${target}` : ""}.`,
    "Load it with the rea tool import_evidence_bundle, or read the JSON. Keep observations, inferences and unknowns apart, and cite evidence IDs.",
  ];
  if (publish) lines.push("Then publish a short report of what it shows as an artifact, and reply with its id.");
  await hostRequest("POST", "/api/ext/v1/messages", { to: agentId, text: lines.join("\n") });
  return { sent: true };
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
    if (url.pathname === "/evidence" && req.method === "GET") {
      const ws = await workspaces();
      const jobs = [...analyses.entries()].map(([target, j]) => ({ target, ...j }));
      return send(200, { bundles: listBundles(evidenceDirs(ws, dataDir)), workspaces: ws.filter((w) => w.extensionOn).map((w) => ({ id: w.id, name: w.name })), analyses: jobs });
    }
    if (url.pathname === "/evidence/view" && req.method === "GET") {
      const found = resolveBundle(url.searchParams.get("id"), await dirs());
      if (!found) return send(404, { error: "That evidence file is gone." });
      return send(200, { ...readBundle(found.path), workspaceId: found.ws.id, workspaceName: found.ws.name, source: found.source });
    }
    if (url.pathname === "/agents" && req.method === "GET") {
      const r = await hostRequest("GET", "/api/ext/v1/agents?workspace=" + encodeURIComponent(url.searchParams.get("workspace") || ""));
      return send(200, { agents: r.agents || [] });
    }
    if (url.pathname === "/analyze" && req.method === "POST") return send(202, await analyze(await body(req)));
    if (url.pathname === "/send" && req.method === "POST") return send(200, await sendToAgent(await body(req)));
    send(404, { error: "Unknown request." });
  } catch (e) {
    send(e.status || 500, { error: e.message });
  }
});

function body(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (b) => {
      size += b.length;
      if (size > 64 << 10) return reject(Object.assign(new Error("Request too large."), { status: 413 }));
      chunks.push(b);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString() || "{}")); } catch { reject(Object.assign(new Error("Unreadable request."), { status: 400 })); }
    });
    req.on("error", reject);
  });
}

try {
  await loadSettings();
} catch (e) {
  log(`settings not read, using defaults: ${e.message}`);
}
server.listen(Number(env.PICODE_EXT_PORT), "127.0.0.1", () => void check());
