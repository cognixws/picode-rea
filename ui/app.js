// The REA page: what your agents can analyse on this computer, from REA's own
// checks, with the one thing to do next on each row. It talks to the
// extension's process through the host's relay; it installs nothing.
(async function () {
  const root = document.getElementById("root");
  const processDoor = await picode.use("process");
  const links = await picode.use("links");
  let check = null;
  let busy = false;
  let error = "";
  let copied = "";
  let showUnavailable = false;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const ago = (iso) => {
    const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
    if (s < 60) return "just now";
    if (s < 3600) return Math.round(s / 60) + " min ago";
    return new Date(iso).toLocaleString();
  };

  async function request(path, method = "GET") {
    if (!processDoor) throw new Error("REA's background process is not running. Turn the extension on, then reopen this page.");
    const r = await processDoor.request(path, { method, body: method === "POST" ? {} : undefined });
    let d;
    try { d = JSON.parse(r.body); } catch { throw new Error("The extension returned an unreadable answer."); }
    if (r.status >= 400) throw new Error(d.error || "That did not work.");
    return d;
  }

  async function load(method = "GET") {
    busy = true;
    render();
    try {
      check = await request("/check", method);
      error = check.error || "";
    } catch (e) {
      error = e.message;
    }
    busy = false;
    root.setAttribute("aria-busy", "false");
    render();
  }

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

  function section(title, rows, extra = "") {
    if (!rows.length) return "";
    return `<section aria-label="${esc(title)}"><h2>${esc(title)} <span class="count">${rows.length}</span></h2><ul class="families">${rows.map(rowHTML).join("")}</ul>${extra}</section>`;
  }

  function render() {
    const head = `<header>
      <h1>REA</h1>
      <p class="muted">Reverse engineering for your agents. Static analysis only: nothing runs the files they read.</p>
    </header>`;
    if (!check) {
      root.innerHTML = head + (error
        ? (/\boff\b|not running|stopped|failed/i.test(error)
          ? `<div class="notice error" role="alert"><span>REA’s background process isn’t running, so it can’t check this computer. Turn REA on in Extensions.</span><button type="button" data-action="extensions">Open Extensions</button></div>`
          : `<div class="notice error" role="alert"><span>REA couldn’t check this computer: ${esc(error)}</span><button type="button" data-action="reload">Try again</button></div>`)
        : `<div class="notice is-busy" role="status"><span>Asking REA what works on this computer…</span></div><div class="skeleton" aria-hidden="true"><div></div><div></div><div></div></div>`);
      return;
    }
    const rows = check.rows || [];
    const ready = rows.filter((r) => r.state === "ready");
    const missing = rows.filter((r) => r.state === "missing" || r.state === "unknown");
    const other = rows.filter((r) => r.state === "licensed" || r.state === "unsupported");
    const status = `<div class="bar${busy ? " is-busy" : ""}" role="status">
      <span>REA ${esc(check.reaVersion)} · agents get the <strong>${check.toolSet === "static" ? "full" : "core"}</strong> tool set (${Number(check.toolCount)} tools)${check.checkedAt ? ` · checked ${esc(ago(check.checkedAt))}` : ""}</span>
      <button type="button" data-action="recheck" ${busy ? "disabled" : ""}>${busy ? "Checking…" : "Check again"}</button>
    </div>`;
    const failed = error ? `<div class="notice error" role="alert"><span>${esc(error)}</span></div>` : "";
    const hidden = other.length
      ? `<button type="button" class="link more" data-action="toggle" aria-expanded="${showUnavailable}">${showUnavailable ? "Hide" : "Show"} ${other.length} not available here</button>`
      : "";
    root.innerHTML = head + status + failed +
      section("Ready", ready) +
      section("Needs setup", missing) +
      hidden + (showUnavailable ? section("Not available here", other) : "") +
      `<p class="foot muted">REA is not a sandbox: its tools read files with your permissions, so give agents only files you trust. What they find goes to their model provider. Settings apply to agents you start after saving.</p>`;
  }

  async function act(el) {
    const name = el.dataset.action;
    try {
      if (name === "reload") return load();
      if (name === "recheck") return load("POST");
      if (name === "toggle") { showUnavailable = !showUnavailable; return render(); }
      if (name === "settings" || name === "extensions") return links.open(new URL("/#/extensions/rea", location.href).href);
      if (name === "guide") return links.open(el.dataset.url);
      if (name === "copy") {
        await links.copy(el.dataset.text);
        copied = el.dataset.text;
        render();
        setTimeout(() => { copied = ""; render(); }, 1500);
      }
    } catch (e) {
      error = e.message;
      render();
    }
  }

  root.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    e.preventDefault();
    void act(el);
  });
  await load();
})().catch(() => {
  const root = document.getElementById("root");
  root.setAttribute("aria-busy", "false");
  root.textContent = "The REA page could not start. Reopen it from Extensions.";
});
