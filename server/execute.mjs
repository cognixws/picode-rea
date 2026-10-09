// The picode-tools/1 executor (ADR-0240): REA's static analyses for every
// agent CLI, including the ones without MCP (Pi, Omp, Grok, Hermes, Muse,
// Antigravity). One request on stdin, one answer on stdout, a fresh process
// per call with PiCode's 60 s and 4 MiB limits. So each tool runs a whole
// workflow in one REA session, saves REA's complete Evidence bundle, and
// answers a compact digest that points at it. Nothing runs the target.
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { groupPage, outputFor, readBundle } from "./evidence.mjs";
import { withREA } from "./mcp-client.mjs";
import { reaEnv } from "./settings.mjs";

const pkg = dirname(dirname(fileURLToPath(import.meta.url)));
const entry = join(pkg, "vendor/node_modules/rea-agents/scripts/rea.mjs");
const BUDGET_MS = 55_000; // inside PiCode's 60 s, with room to answer

let text = "";
for await (const chunk of process.stdin) text += chunk;
const request = JSON.parse(text);
answer(await run(request).catch((e) => fail(e.message)));

async function run(req) {
  if (req.protocol !== "picode-tools/1" || req.capability !== "static") return fail("Unknown capability.");
  const args = req.arguments || {};
  const ctx = req.context || {};
  const settings = reaEnv(req.settings || {});
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("PICODE_")) env[k] = v;
  Object.assign(env, settings.env);
  const at = (p) => {
    if (typeof p !== "string" || !p) throw new Error("Give the file's path.");
    const abs = isAbsolute(p) ? p : resolve(ctx.workDir || process.cwd(), p);
    if (!existsSync(abs)) throw new Error(`No such file: ${abs}`);
    return abs;
  };
  const dataDir = ctx.dataDir || join(pkg, "../data");
  const save = (target) => outputFor(dataDir, ctx.workspace || "free", target, ".agent.json");
  const session = (work) => withREA({ entry, env, cwd: dataDir, timeoutMs: BUDGET_MS }, work);

  switch (req.tool) {
    case "analyze-app": {
      const target = at(args.path);
      const out = save(target);
      await session(async ({ call }) => {
        await call("analyze_javascript_application", { input_path: target });
        await call("export_evidence_bundle", { path: out });
      });
      return digestAnswer(out, "JavaScript/Electron application graph");
    }
    case "trace-feature": {
      const target = at(args.path);
      const out = save(target);
      let trace;
      await session(async ({ call }) => {
        const app = await call("analyze_javascript_application", { input_path: target });
        const seed = { kind: args.kind, value: String(args.value || ""), match: args.match || "contains" };
        trace = (await call("trace_application_feature", { seed, application: app.evidence })).result;
        await call("export_evidence_bundle", { path: out });
      });
      const nodes = trace?.graph?.nodes || [];
      const byKind = {};
      for (const n of nodes) (byKind[n.kind || "other"] ??= []).push(n);
      const touched = Object.entries(byKind).map(([kind, list]) => ({
        kind,
        count: list.length,
        items: list.slice(0, 15).map((n) => {
          const o = (n.observations || []).find((x) => x.label) || n.observations?.[0];
          const loc = o?.evidence?.location?.value;
          return `${o?.label || n.identity?.key || n.node_id}${loc?.source ? ` @ ${loc.source}${loc.start?.line ? ":" + loc.start.line : ""}` : ""}`;
        }),
      }));
      const data = { bundle: out, seed: trace?.seed, summary: trace?.summary, seedMatches: trace?.seed_matches?.length ?? null, touched, limitations: (trace?.limitations || []).slice(0, 6) };
      return ok(`Traced ${args.kind} "${args.value}" through the app. Full Evidence saved to ${out}.`, data);
    }
    case "inspect-package": {
      const target = at(args.path);
      const out = save(target);
      await session(async ({ call }) => {
        await call("open_binary", { path: target });
        await call("inspect_artifact", {});
        await call("export_evidence_bundle", { path: out });
      });
      return digestAnswer(out, "package inventory");
    }
    case "inspect-dotnet": {
      const target = at(args.path);
      const out = save(target);
      await session(async ({ call }) => {
        await call("inspect_managed_artifact", { path: target });
        await call("export_evidence_bundle", { path: out });
      });
      return digestAnswer(out, ".NET assembly");
    }
    case "inspect-android": {
      const target = at(args.path);
      const out = save(target);
      await session(async ({ call }) => {
        await call("inspect_android_package", { path: target });
        await call("export_evidence_bundle", { path: out });
      });
      return digestAnswer(out, "Android package");
    }
    case "inspect-capture": {
      const target = at(args.path);
      const out = save(target);
      await session(async ({ call }) => {
        await call("inspect_web_network_capture", { capture_path: target, format: args.format || "har" });
        await call("export_evidence_bundle", { path: out });
      });
      return digestAnswer(out, "network capture");
    }
    case "read-evidence": {
      const path = at(args.bundle);
      if (args.kind) {
        const page = groupPage(path, { record: args.record ?? 0, kind: args.kind, offset: args.offset ?? 0, limit: 100 });
        return ok(`${page.total} ${args.kind} item(s); showing ${page.items.length} from ${page.offset}.`, page);
      }
      return digestAnswer(path, "saved Evidence");
    }
    default:
      return fail("Unknown tool.");
  }
}

function digestAnswer(path, what) {
  const b = readBundle(path);
  const records = b.records.map((r) => ({
    evidenceId: r.evidenceId,
    operation: r.operation,
    target: r.target,
    confidence: r.confidence,
    summary: Object.fromEntries(r.summary),
    groups: r.groups.map((g) => ({ kind: g.kind, count: g.count, items: g.items.slice(0, 15).map((i) => (i.where ? `${i.label} @ ${i.where}` : i.label)) })),
    limitations: r.limitations.slice(0, 6),
  }));
  const data = { bundle: path, records, unknowns: b.unknowns };
  const head = `REA ${what}: ${records.length} record(s). Full Evidence saved to ${path}. Lists show up to 15 items per kind; read-evidence with kind pages through the rest.`;
  return ok(head, data);
}

function ok(head, data) {
  return { content: [{ type: "text", text: head + "\n" + JSON.stringify(data) }], structuredContent: data };
}

function fail(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

function answer(result) {
  process.stdout.write(JSON.stringify(result));
}
