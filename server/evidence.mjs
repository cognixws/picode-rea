// Evidence bundles: where they are, what is in them, and the page's own
// static analyses. A bundle is what REA's export_evidence_bundle writes:
// { records, artifacts, unknowns, … }, each record carrying its operation,
// subject, confidence, limitations and a normalized result.
import { mkdirSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";

const MAX_BYTES = 64 << 20;

// Folders that hold bundles: each workspace's .rea/evidence (agents export
// there, per the skill) and the extension's own data/evidence/<workspace>
// (the page's analyses).
export function evidenceDirs(workspaces, dataDir) {
  const out = [];
  for (const ws of workspaces) {
    if (!ws.extensionOn) continue;
    if (ws.path) out.push({ dir: join(ws.path, ".rea", "evidence"), ws, source: "agent" });
    out.push({ dir: join(dataDir, "evidence", ws.id), ws, source: "page" });
  }
  return out;
}

export function listBundles(dirs) {
  const out = [];
  for (const { dir, ws, source } of dirs) {
    let names;
    try { names = readdirSync(dir); } catch { continue; }
    for (const name of names) {
      if (extname(name) !== ".json") continue;
      const path = join(dir, name);
      let st;
      try { st = statSync(path); } catch { continue; }
      if (!st.isFile()) continue;
      const byAgent = name.endsWith(".agent.json");
      out.push({ id: encode(path), name: basename(name, byAgent ? ".agent.json" : ".json"), path, bytes: st.size, modified: st.mtime.toISOString(), workspaceId: ws.id, workspaceName: ws.name, source: byAgent ? "agent" : source });
    }
  }
  return out.sort((a, b) => b.modified.localeCompare(a.modified));
}

// resolveBundle maps an id back to a file, only inside a known folder.
export function resolveBundle(id, dirs) {
  const path = decode(id);
  if (!path || !isAbsolute(path) || extname(path) !== ".json") return null;
  let real;
  try { real = realpathSync(path); } catch { return null; }
  for (const d of dirs) {
    let root;
    try { root = realpathSync(d.dir); } catch { continue; }
    if (real.startsWith(root + sep)) return { path: real, ws: d.ws, source: d.source };
  }
  return null;
}

// Kinds shown first when a graph has them: what a person asks about an app.
const FIRST = ["route", "page", "screen", "ipc-channel", "ipc-handler", "browser-window", "electron-preload", "context-bridge-api", "electron-main", "electron-renderer", "activity", "service", "receiver", "provider"];

// groupPage answers one graph group of one record in full, a page at a time
// (the digest keeps 30 items per group).
export function groupPage(path, { record = 0, kind, offset = 0, limit = 100 }) {
  const d = JSON.parse(readFileSync(path, "utf8"));
  const r = d.records?.[record];
  if (!r) throw new Error(`No record ${record} in this bundle.`);
  const n = r.normalized_result || {};
  const nodes = (n.graph || n.semantic_graph)?.nodes || [];
  const items = nodes.filter((x) => (x.kind || "other") === kind).map((x) => ({ label: label(x), where: where(x) }));
  return { kind, total: items.length, offset, items: items.slice(offset, offset + limit), more: offset + limit < items.length };
}

export function readBundle(path) {
  const st = statSync(path);
  if (st.size > MAX_BYTES) throw new Error(`This bundle is ${Math.round(st.size / 2 ** 20)} MB; the page reads up to 64 MB.`);
  const d = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(d.records)) throw new Error("This file is not an REA evidence bundle.");
  return {
    path,
    bytes: st.size,
    modified: st.mtime.toISOString(),
    unknowns: Array.isArray(d.unknowns) ? d.unknowns.length : 0,
    records: d.records.map(digest),
  };
}

function digest(r) {
  const n = r.normalized_result || {};
  const graph = n.graph || n.semantic_graph || null;
  return {
    evidenceId: r.evidence_id,
    operation: r.operation,
    predicate: r.predicate_type,
    confidence: r.confidence,
    authority: r.authority,
    provider: r.provider?.name || r.provider?.id || "",
    target: { path: r.subject?.local_path || "", format: r.subject?.format || n.format || "", sha256: r.subject?.digest?.sha256 || "" },
    limitations: (r.limitations || []).slice(0, 12),
    summary: flatten(n.summary).slice(0, 40),
    statistics: flatten(n.statistics).slice(0, 24),
    groups: graph && Array.isArray(graph.nodes) ? groups(graph.nodes) : captureGroups(n),
  };
}

// A network capture has no graph: its records are the requests.
function captureGroups(n) {
  if (!Array.isArray(n.records)) return [];
  const reqs = n.records.filter((r) => r.reported?.request);
  if (!reqs.length) return [];
  return [{
    kind: "request",
    count: n.total_records ?? reqs.length,
    items: reqs.slice(0, 30).map((r) => {
      const q = r.reported.request;
      const status = r.reported.response?.status;
      return { label: `${q.method || "?"} ${String(q.url || "").slice(0, 140)}${status ? ` → ${status}` : ""}`, where: r.location?.pointer || "" };
    }),
  }];
}

function groups(nodes) {
  const by = new Map();
  for (const node of nodes) {
    const kind = node.kind || "other";
    if (!by.has(kind)) by.set(kind, []);
    by.get(kind).push(node);
  }
  const kinds = [...by.keys()].sort((a, b) => rank(a) - rank(b) || by.get(b).length - by.get(a).length);
  return kinds.map((kind) => ({
    kind,
    count: by.get(kind).length,
    items: by.get(kind).slice(0, 30).map((node) => ({ label: label(node), where: where(node) })),
  }));
}

const rank = (k) => (FIRST.includes(k) ? FIRST.indexOf(k) : FIRST.length);

function label(node) {
  const observed = (node.observations || []).find((o) => o.label)?.label;
  const key = observed || node.identity?.key || node.label || node.name || node.node_id || "";
  return String(key).slice(0, 160);
}

function where(node) {
  for (const o of node.observations || []) {
    const v = o.evidence?.location?.value;
    if (v?.source) return v.start?.line ? `${v.source}:${v.start.line}` : v.source;
  }
  return "";
}

// flatten turns a nested summary into [label, value] rows.
function flatten(v, prefix = "") {
  if (v === null || v === undefined) return [];
  if (typeof v !== "object") return [[prefix || "value", String(v)]];
  if (Array.isArray(v)) return v.length && typeof v[0] !== "object" ? [[prefix, v.slice(0, 12).join(", ")]] : [[prefix, `${v.length} items`]];
  return Object.entries(v).flatMap(([k, x]) => flatten(x, prefix ? `${prefix} › ${k}` : k));
}

// ---- the page's own analyses (Open with), static only ----

// planFor names the REA calls for a file, by its extension. Every call reads
// the file; none runs it.
export function planFor(path) {
  const ext = extname(path).toLowerCase();
  if (ext === ".asar") return [["analyze_javascript_application", { input_path: path }]];
  if (ext === ".har") return [["inspect_web_network_capture", { capture_path: path, format: "har" }]];
  if (ext === ".exe" || ext === ".dll") return [["inspect_managed_artifact", { path }]];
  if ([".apk", ".zip", ".ipa", ".msix", ".appx", ".jar"].includes(ext)) return [["open_binary", { path }], ["inspect_artifact", {}]];
  return null;
}

export function targetPath(contextPath, ws) {
  if (!contextPath) return null;
  const p = isAbsolute(contextPath) ? contextPath : resolve(ws?.path || "/", contextPath);
  if (ws?.path) {
    const rel = relative(ws.path, p);
    if (rel.startsWith("..") || isAbsolute(rel)) return null;
  }
  return p;
}

export function outputFor(dataDir, wsId, target, suffix = ".json") {
  const dir = join(dataDir, "evidence", wsId);
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "");
  return join(dir, `${basename(target).replace(/[^\w.-]+/g, "_")}-${stamp}${suffix}`);
}

const encode = (p) => Buffer.from(p).toString("base64url");
const decode = (id) => {
  try { return Buffer.from(String(id), "base64url").toString(); } catch { return ""; }
};
