// A minimal MCP client over stdio for the extension's own calls to REA (the
// Check and the page's analyses). Agents never go through it: they talk to
// server/rea-mcp.mjs.
import { spawn } from "node:child_process";

export async function withREA({ entry, env, cwd, timeoutMs = 300_000 }, work) {
  const p = spawn(process.execPath, [entry, "mcp"], { stdio: ["pipe", "pipe", "ignore"], env, cwd });
  const pending = new Map();
  let next = 0;
  let buf = "";
  let failure = null;
  const fail = (e) => {
    failure ??= e;
    for (const [, r] of pending) r.reject(e);
    pending.clear();
  };
  const timer = setTimeout(() => fail(new Error(`REA did not finish in ${Math.round(timeoutMs / 1000)} s`)), timeoutMs);
  p.on("error", fail);
  p.on("exit", () => fail(new Error("REA stopped")));
  p.stdout.setEncoding("utf8");
  p.stdout.on("data", (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      let m;
      try { m = JSON.parse(line); } catch { continue; }
      const r = pending.get(m.id);
      if (!r) continue;
      pending.delete(m.id);
      if (m.error) r.reject(new Error(m.error.message || "REA refused the request"));
      else r.resolve(m.result);
    }
  });
  const rpc = (method, params) => {
    if (failure) return Promise.reject(failure);
    const id = ++next;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  };
  // call answers a tool's structured answer ({ result, evidence_id,
  // evidence } for most tools), or throws with REA's own message.
  const call = async (name, args) => {
    const r = await rpc("tools/call", { name, arguments: args });
    if (r.isError) throw new Error(errorText(r));
    return r.structuredContent ?? parseText(r);
  };
  try {
    await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "picode-rea", version: "1" } });
    p.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    return await work({ call });
  } finally {
    clearTimeout(timer);
    p.removeAllListeners("exit");
    p.kill();
  }
}

function parseText(r) {
  try {
    return JSON.parse(r.content?.[0]?.text ?? "null");
  } catch {
    return null;
  }
}

function errorText(r) {
  const t = r.content?.[0]?.text ?? "";
  try {
    const d = JSON.parse(t);
    return d.error?.message || d.message || t;
  } catch {
    return t || "REA reported an error";
  }
}
