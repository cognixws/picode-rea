// The REA page, two tabs:
//   Evidence  bundles agents exported and the page's own static analyses
//             (Open with), each readable here and sendable to an agent;
//   Check     what your agents can analyse on this computer, from REA's own
//             checks, with the one thing to do next on each row.
// It talks to the extension's process through the host's relay; it installs
// nothing and runs no target.
(async function () {
  const root = document.getElementById("root");
  const processDoor = await picode.use("process");
  const links = await picode.use("links");
  const contextDoor = await picode.use("context");

  let tab = "evidence";
  let check = null, checking = false, checkError = "";
  let evidence = null, evidenceError = "";
  let open = null, openError = "", openId = "";
  let agents = [], agentId = "", sending = "", sent = "";
  let copied = "", showUnavailable = false, notice = "";
  let poll = 0;
  let lastContext = "";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const ago = (iso) => {
    const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
    if (s < 60) return "just now";
    if (s < 3600) return Math.round(s / 60) + " min ago";
    if (s < 86400) return Math.round(s / 3600) + " h ago";
    return new Date(iso).toLocaleDateString();
  };
  const size = (b) => (b < 1024 ? b + " B" : b < 1 << 20 ? Math.round(b / 1024) + " KB" : (b / (1 << 20)).toFixed(1) + " MB");
  const base = (p) => String(p || "").split(/[\\/]/).pop();
  const STOPPED = /\boff\b|not running|stopped|failed to start/i;
  // "analyze_javascript_application" → "Analyze JavaScript application".
  const WORDS = { ipc: "IPC", api: "API", apis: "APIs", javascript: "JavaScript", asar: "ASAR", apk: "APK", har: "HAR", url: "URL", urls: "URLs", dll: "DLL", ui: "UI", evm: "EVM", elf: "ELF", utf8: "UTF-8", ast: "AST", id: "ID", ids: "IDs", cdp: "CDP" };
  // Words split on _ - and spaces; "›" between levels is kept.
  const human = (s) => String(s || "").replace(/[_-]+/g, " ").split(" ").map((w, i) => WORDS[w.toLowerCase()] || (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");

  async function request(path, method = "GET", body) {
    if (!processDoor) throw new Error("not running");
    const r = await processDoor.request(path, { method, body: method === "POST" ? body || {} : undefined });
    let d;
    try { d = JSON.parse(r.body); } catch { throw new Error("The extension returned an unreadable answer."); }
    if (r.status >= 400) throw new Error(d.error || "That did not work.");
    return d;
  }

  // ---- loading ----

  async function loadEvidence() {
    try { evidence = await request("/evidence"); evidenceError = ""; } catch (e) { evidenceError = e.message; }
    clearTimeout(poll);
    if (evidence?.analyses?.some((a) => a.state === "running")) poll = setTimeout(async () => { await loadEvidence(); finishAnalyses(); }, 1500);
    render();
  }

  async function loadCheck(method = "GET") {
    checking = true;
    render();
    try { check = await request("/check", method); checkError = check.error || ""; } catch (e) { checkError = e.message; }
    checking = false;
    render();
  }

  async function openBundle(id) {
    openId = id;
    open = null;
    openError = "";
    sent = "";
    render();
    try {
      open = await request("/evidence/view?id=" + encodeURIComponent(id));
      const r = await request("/agents?workspace=" + encodeURIComponent(open.workspaceId));
      agents = r.agents || [];
      if (!agents.some((a) => a.id === agentId)) agentId = agents[0]?.id || "";
    } catch (e) {
      openError = e.message;
    }
    render();
  }

  // ---- Open with: analyse the file, then show it ----

  let waitingFor = "";
  async function analyseFromContext(ctx) {
    if (!ctx?.path) return;
    const key = ctx.path + "|" + (ctx.workspaceId || "");
    if (key === lastContext) return;
    lastContext = key;
    tab = "evidence";
    open = null;
    openId = "";
    try {
      const job = await request("/analyze", "POST", { path: ctx.path, workspaceId: ctx.workspaceId || "" });
      waitingFor = job.target;
      notice = "";
    } catch (e) {
      notice = `Couldn’t analyse ${base(ctx.path)}: ${e.message}`;
    }
    await loadEvidence();
  }

  function finishAnalyses() {
    if (!waitingFor || !evidence) return;
    const job = evidence.analyses.find((a) => a.target === waitingFor);
    if (!job || job.state === "running") return;
    const target = waitingFor;
    waitingFor = "";
    if (job.state === "failed") { notice = `REA couldn’t analyse ${base(target)}: ${job.error}`; render(); return; }
    void openBundle(job.id);
  }

  // ---- rendering ----

  function render() {
    const head = `<header>
      <h1>REA</h1>
      <p class="muted">Reverse engineering for your agents. Static analysis only: nothing runs the files they read.</p>
      <div class="tabs" role="tablist">
        <button type="button" role="tab" aria-selected="${tab === "evidence"}" data-action="tab" data-tab="evidence">Evidence</button>
        <button type="button" role="tab" aria-selected="${tab === "check"}" data-action="tab" data-tab="check">What works here</button>
      </div>
    </header>`;
    const stoppedErr = [evidenceError, checkError, openError].find((e) => STOPPED.test(e || ""));
    if (stoppedErr || !processDoor) {
      root.innerHTML = head + `<div class="notice error" role="alert"><span>REA’s background process isn’t running. Turn REA on in Extensions.</span><button type="button" data-action="extensions">Open Extensions</button></div>`;
      return;
    }
    root.innerHTML = head + (notice ? `<div class="notice warn" role="status"><span>${esc(notice)}</span><button type="button" data-action="dismiss">Dismiss</button></div>` : "") + (tab === "check" ? checkView() : openId ? bundleView() : evidenceView());
  }

  // Evidence list

  function evidenceView() {
    if (!evidence) {
      return evidenceError
        ? `<div class="notice error" role="alert"><span>Couldn’t list the evidence: ${esc(evidenceError)}</span><button type="button" data-action="reload-evidence">Try again</button></div>`
        : `<div class="skeleton" aria-label="Loading"><div></div><div></div><div></div></div>`;
    }
    const running = (evidence.analyses || []).filter((a) => a.state === "running");
    const busy = running.map((a) => `<div class="notice is-busy" role="status"><span>Analysing ${esc(base(a.target))}… The result opens here when it’s ready.</span></div>`).join("");
    if (!evidence.workspaces.length) {
      return busy + `<div class="notice"><span>REA is off in every workspace. Turn it on in a workspace to give its agents REA.</span><button type="button" data-action="extensions">Open Extensions</button></div>`;
    }
    if (!evidence.bundles.length) {
      return busy + `<div class="notice"><span>No evidence yet. Ask an agent to analyse an app with REA, or open an app file and choose “Analyse with REA”.</span><button type="button" data-action="tab" data-tab="check">What works here</button></div>`;
    }
    const rows = evidence.bundles.map((b) => `<li><button type="button" class="bundle" data-action="open" data-id="${esc(b.id)}">
        <span class="name">${esc(b.name)}</span><span class="chev" aria-hidden="true">›</span>
        <span class="meta">${esc(b.workspaceName)} · ${b.source === "page" ? "Open with" : "an agent"} · ${esc(size(b.bytes))} · ${esc(ago(b.modified))}</span>
      </button></li>`).join("");
    return busy + `<section aria-label="Evidence"><h2>Evidence <span class="count">${evidence.bundles.length}</span></h2><ul class="list">${rows}</ul></section>
      <p class="foot muted">What your agents found with REA, and the files you analysed with “Analyse with REA”.</p>`;
  }

  // One bundle

  function bundleView() {
    const back = `<button type="button" class="link back" data-action="back">← All evidence</button>`;
    if (!open) {
      return back + (openError
        ? `<div class="notice error" role="alert"><span>${esc(openError)}</span><button type="button" data-action="back">Back</button></div>`
        : `<div class="skeleton" aria-label="Loading"><div></div><div></div><div></div></div>`);
    }
    const agentPick = agents.length
      ? `<div class="send" data-align-row>
          <label class="sr" for="agent">Agent</label>
          <select id="agent" data-action="agent">${agents.map((a) => `<option value="${esc(a.id)}"${a.id === agentId ? " selected" : ""}>${esc(a.name)} (${esc(a.cli)})</option>`).join("")}</select>
          <button type="button" data-action="send" ${sending ? "disabled" : ""}>${sending === "send" ? "Sending…" : "Send to agent"}</button>
          <button type="button" class="primary" data-action="publish" ${sending ? "disabled" : ""}>${sending === "publish" ? "Sending…" : "Open as artifact"}</button>
        </div>
        <p class="muted small">${sent ? esc(sent) : "“Open as artifact” asks the agent to publish a report of this evidence beside you."}</p>`
      : `<div class="notice"><span>No agents in ${esc(open.workspaceName)} to send it to.</span></div>`;
    const records = open.records.map((r) => {
      const groups = r.groups.map((g) => `<details class="group"${g.items.length <= 8 ? " open" : ""}>
          <summary><span>${esc(human(g.kind))}</span><span class="count">${g.count}</span></summary>
          <ul>${g.items.map((i) => `<li><span class="label">${esc(i.label)}</span>${i.where ? `<span class="where">${esc(i.where)}</span>` : ""}</li>`).join("")}${g.count > g.items.length ? `<li class="muted">and ${g.count - g.items.length} more</li>` : ""}</ul>
        </details>`).join("");
      const facts = [...r.summary, ...r.statistics].slice(0, 24);
      return `<article class="record">
        <h3>${esc(human(r.operation))}</h3>
        <p class="meta">${esc(base(r.target.path) || "session")}${r.target.format ? ` · ${esc(r.target.format)}` : ""} · ${esc(r.confidence)} · ${esc(r.provider)}</p>
        ${groups || ""}
        ${facts.length ? `<details class="group"><summary><span>Summary</span><span class="count">${facts.length}</span></summary><dl class="facts">${facts.map(([k, v]) => `<dt>${esc(human(k))}</dt><dd>${esc(v)}</dd>`).join("")}</dl></details>` : ""}
        ${r.limitations.length ? `<details class="group"><summary><span>What REA could not tell</span><span class="count">${r.limitations.length}</span></summary><ul>${r.limitations.map((l) => `<li class="limit">${esc(l)}</li>`).join("")}</ul></details>` : ""}
        <p class="id muted" title="Evidence ID">${esc(r.evidenceId || "")}${r.target.sha256 ? ` · sha256 ${esc(r.target.sha256.slice(0, 12))}…` : ""}</p>
      </article>`;
    }).join("");
    return back + `<section class="head"><h2>${esc(base(open.path))}</h2><p class="muted small path">${esc(open.path)}</p>
        <p class="muted small">${open.records.length} record${open.records.length === 1 ? "" : "s"} · ${esc(size(open.bytes))} · ${esc(ago(open.modified))}${open.unknowns ? ` · ${open.unknowns} open question${open.unknowns === 1 ? "" : "s"}` : ""}</p>
        ${agentPick}</section>${records}`;
  }

  // Check

  const STATE = {
    ready: { label: "Ready", cls: "ok" },
    missing: { label: "Needs setup", cls: "warn" },
    licensed: { label: "Your license", cls: "muted" },
    unsupported: { label: "Needs a Mac", cls: "muted" },
    unknown: { label: "Unknown", cls: "muted" },
  };

  function action(row) {
    if (row.state === "missing") return `<button type="button" data-action="settings">Set up</button>`;
    if (row.state === "licensed") return `<button type="button" data-action="guide" data-url="${esc(row.guide)}">How it works</button>`;
    if (row.state === "ready" && !row.inSet) return `<button type="button" data-action="settings">Give to agents</button>`;
    return "";
  }

  function rowHTML(row) {
    const st = STATE[row.state] || STATE.unknown;
    const notInSet = row.state === "ready" && !row.inSet ? `<p class="note">Only in the full tool set; your agents get the core set.</p>` : "";
    const detail = row.state === "ready" ? "" : row.detail ? `<p class="detail"${row.rea ? ` title="${esc("REA: " + row.rea)}"` : ""}>${esc(row.detail)}</p>` : "";
    const command = row.state === "missing" && row.command
      ? `<p class="command"><code>${esc(row.command.text)}</code><button type="button" class="small" data-action="copy" data-text="${esc(row.command.text)}">${copied === row.command.text ? "Copied" : "Copy"}</button></p>`
      : "";
    const guide = row.state === "missing" ? `<a href="${esc(row.guide)}" data-action="guide" data-url="${esc(row.guide)}">REA's guide</a>` : "";
    return `<li class="family">
      <span class="pill ${st.cls}">${st.label}</span>
      <div class="body">
        <h3>${esc(row.title)}</h3>
        <p class="what">${esc(row.what)}</p>
        ${detail}${command}${notInSet}${guide ? `<p class="guide">${guide}</p>` : ""}
      </div>
      <div class="act">${action(row)}</div>
    </li>`;
  }

  function section(title, rows) {
    if (!rows.length) return "";
    return `<section aria-label="${esc(title)}"><h2>${esc(title)} <span class="count">${rows.length}</span></h2><ul class="families">${rows.map(rowHTML).join("")}</ul></section>`;
  }

  function checkView() {
    if (!check) {
      return checkError
        ? `<div class="notice error" role="alert"><span>REA couldn’t check this computer: ${esc(checkError)}</span><button type="button" data-action="recheck">Try again</button></div>`
        : `<div class="notice is-busy" role="status"><span>Asking REA what works on this computer…</span></div><div class="skeleton" aria-hidden="true"><div></div><div></div><div></div></div>`;
    }
    const rows = check.rows || [];
    const ready = rows.filter((r) => r.state === "ready");
    const missing = rows.filter((r) => r.state === "missing" || r.state === "unknown");
    const other = rows.filter((r) => r.state === "licensed" || r.state === "unsupported");
    const status = `<div class="bar${checking ? " is-busy" : ""}" role="status">
      <span>REA ${esc(check.reaVersion)} · agents get the <strong>${check.toolSet === "static" ? "full" : "core"}</strong> tool set (${Number(check.toolCount)} tools)${check.checkedAt ? ` · checked ${esc(ago(check.checkedAt))}` : ""}</span>
      <button type="button" data-action="recheck" ${checking ? "disabled" : ""}>${checking ? "Checking…" : "Check again"}</button>
    </div>`;
    const failed = checkError ? `<div class="notice error" role="alert"><span>${esc(checkError)}</span></div>` : "";
    const hidden = other.length
      ? `<button type="button" class="link more" data-action="toggle" aria-expanded="${showUnavailable}">${showUnavailable ? "Hide" : "Show"} ${other.length} not available here</button>`
      : "";
    return status + failed + section("Ready", ready) + section("Needs setup", missing) +
      hidden + (showUnavailable ? section("Not available here", other) : "") +
      `<p class="foot muted">REA is not a sandbox: its tools read files with your permissions, so give agents only files you trust. What they find goes to their model provider. Settings apply to agents you start after saving.</p>`;
  }

  // ---- actions ----

  async function send(publish) {
    if (!agentId || !open) return;
    sending = publish ? "publish" : "send";
    sent = "";
    render();
    try {
      await request("/send", "POST", { id: openId, agentId, publish });
      const a = agents.find((x) => x.id === agentId);
      sent = publish ? `Sent. ${a?.name || "The agent"} will publish the report as an artifact.` : `Sent to ${a?.name || "the agent"}.`;
    } catch (e) {
      sent = `Not sent: ${e.message}`;
    }
    sending = "";
    render();
  }

  async function act(el) {
    const name = el.dataset.action;
    try {
      if (name === "tab") {
        tab = el.dataset.tab;
        render();
        if (tab === "check" && !check && !checking) await loadCheck();
        return;
      }
      if (name === "recheck") return loadCheck("POST");
      if (name === "reload-evidence") return loadEvidence();
      if (name === "toggle") { showUnavailable = !showUnavailable; return render(); }
      if (name === "dismiss") { notice = ""; return render(); }
      if (name === "open") return openBundle(el.dataset.id);
      if (name === "back") { openId = ""; open = null; await loadEvidence(); return; }
      if (name === "send") return send(false);
      if (name === "publish") return send(true);
      if (name === "settings" || name === "extensions") return links.open(new URL("/#/extensions/rea", location.href).href);
      if (name === "guide") return links.open(el.dataset.url);
      if (name === "copy") {
        await links.copy(el.dataset.text);
        copied = el.dataset.text;
        render();
        setTimeout(() => { copied = ""; render(); }, 1500);
      }
    } catch (e) {
      notice = e.message;
      render();
    }
  }

  root.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || el.tagName === "SELECT") return;
    e.preventDefault();
    void act(el);
  });
  root.addEventListener("change", (e) => {
    if (e.target.id === "agent") { agentId = e.target.value; sent = ""; }
  });

  root.setAttribute("aria-busy", "false");
  render();
  await loadEvidence();
  if (contextDoor) {
    contextDoor.onChange((c) => void analyseFromContext(c));
    await analyseFromContext(contextDoor.current());
  }
})().catch(() => {
  const root = document.getElementById("root");
  root.setAttribute("aria-busy", "false");
  root.textContent = "The REA page could not start. Reopen it from Extensions.";
});
