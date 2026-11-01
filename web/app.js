/* =========================================================================
   Bisect — front-end
   Talks to server.py, which calls the team's Python modules.
   No frameworks; small reusable helpers at the top, one block per screen.
   ========================================================================= */
(() => {
  "use strict";

  /* ───────────── helpers ───────────── */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const fmt = (n) => (n == null || Number.isNaN(n) ? "—" : Number(n).toLocaleString("en-US"));
  const fmtMs = (ms) => {
    if (ms == null) return "—";
    if (ms < 0.001) return (ms * 1000).toFixed(2) + " µs";
    if (ms < 1) return (ms * 1000).toFixed(1) + " µs";
    if (ms < 1000) return ms.toFixed(ms < 10 ? 2 : 1) + " ms";
    return (ms / 1000).toFixed(2) + " s";
  };
  const fmtShort = (n) => n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + "M" : n >= 1e3 ? (n / 1e3).toFixed(n % 1e3 ? 1 : 0) + "K" : String(n);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const store = {
    get(k, d) { try { const v = localStorage.getItem("bisect:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("bisect:" + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };
  const parseIntLoose = (s) => {
    const clean = String(s).trim().toLowerCase().replace(/[,_\s]/g, "");
    const m = clean.match(/^(\d+(?:\.\d+)?)([km]?)$/);
    if (!m) return NaN;
    return Math.round(parseFloat(m[1]) * (m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : 1));
  };

  class ApiError extends Error { constructor(msg, status, data) { super(msg); this.status = status; this.data = data; } }

  async function api(path, body, opts = {}) {
    let res;
    try {
      res = await fetch(path, {
        method: body === undefined ? "GET" : "POST",
        headers: body === undefined ? {} : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: opts.signal,
      });
    } catch (e) {
      if (e.name === "AbortError") throw e;
      throw new ApiError("Can't reach the server. Is `python server.py` still running?", 0);
    }
    let data = {};
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status}).`, res.status, data);
    return data;
  }

  /* busy state on a button while a promise runs */
  async function withBusy(btn, fn) {
    if (!btn || btn.classList.contains("is-busy")) return;
    btn.classList.add("is-busy");
    btn.setAttribute("aria-busy", "true");
    try { return await fn(); }
    finally { btn.classList.remove("is-busy"); btn.removeAttribute("aria-busy"); }
  }

  /* ───────────── toasts ───────────── */
  function toast(msg, kind = "info", ms = 3800) {
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.innerHTML = `<i aria-hidden="true"></i><span>${esc(msg)}</span>`;
    $("#toasts").appendChild(el);
    setTimeout(() => { el.classList.add("out"); el.addEventListener("animationend", () => el.remove(), { once: true }); }, ms);
  }

  function invalid(input, msg) {
    input.classList.remove("is-invalid"); void input.offsetWidth;
    input.classList.add("is-invalid");
    input.setAttribute("aria-invalid", "true");
    input.focus();
    if (msg) toast(msg, "err");
    input.addEventListener("input", () => { input.classList.remove("is-invalid"); input.removeAttribute("aria-invalid"); }, { once: true });
  }

  /* ───────────── tooltips ───────────── */
  const tip = $("#tip");
  let tipTarget = null;
  function showTip(el) {
    const text = el.getAttribute("data-tip");
    if (!text) return;
    tipTarget = el;
    tip.textContent = text;
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    let left = r.left + r.width / 2 - t.width / 2;
    left = Math.max(8, Math.min(left, innerWidth - t.width - 8));
    let top = r.top - t.height - 8;
    if (top < 8) top = r.bottom + 8;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }
  function hideTip() { tip.hidden = true; tipTarget = null; }
  document.addEventListener("mouseover", (e) => { const el = e.target.closest("[data-tip]"); if (el && el !== tipTarget) showTip(el); else if (!el && tipTarget) hideTip(); });
  document.addEventListener("focusin", (e) => { const el = e.target.closest("[data-tip]"); el ? showTip(el) : hideTip(); });
  document.addEventListener("focusout", hideTip);
  addEventListener("scroll", hideTip, true);

  /* ───────────── theme ───────────── */
  const root = document.documentElement;
  const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = store.get("theme", prefersDark ? "dark" : "light");
  function toggleTheme() {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    store.set("theme", root.dataset.theme);
    if (bench.results.length) drawChart();
  }
  $("#themeToggle").addEventListener("click", toggleTheme);

  /* ───────────── app state ───────────── */
  const app = { summary: { n: 0 } };

  function setSummary(s) {
    const prevN = app.summary.n;
    app.summary = s;
    const has = s.n > 0;
    $("#sbDot").classList.toggle("is-live", has);
    $("#sbLabel").textContent = has ? s.label || "Dataset" : "No dataset loaded";
    $("#sbN").textContent = has ? fmt(s.n) : "—";
    $("#sbLog").textContent = has ? s.log2n.toFixed(2) : "—";
    $("#sbMax").textContent = has ? s.max_binary_steps : "—";
    if (prevN !== s.n) $$(".sb-v").forEach((el) => { el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); });

    $$("[data-needs-data]").forEach((el) => (el.hidden = has));
    ["#searchBtn", "#randomKey", "#delBtn"].forEach((sel) => { const b = $(sel); b.disabled = !has; b.title = has ? "" : "Load or generate a dataset first"; });
    $("#prefixQ").disabled = !has;
    $("#searchQ").disabled = !has;
    $("#acN").textContent = has ? fmt(s.n) : "n";
    renderProfile();
  }

  /* ───────────── router ───────────── */
  const VIEWS = ["dataset", "search", "prefix", "edit", "bench", "theory"];
  function route() {
    let v = (location.hash.match(/^#\/(\w+)/) || [])[1];
    if (!VIEWS.includes(v)) v = "dataset";
    $$(".view").forEach((s) => (s.hidden = s.dataset.view !== v));
    $$(".nav-link, .tabbar a").forEach((a) => {
      const on = a.dataset.view === v;
      a.classList.toggle("is-active", on);
      on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
    });
    moveIndicator();
    document.title = `${$(`.view[data-view="${v}"] h1`).textContent} · Bisect`;
    if (route.first) { $("#main").focus({ preventScroll: true }); scrollTo({ top: 0, behavior: "smooth" }); }
    route.first = true;
    if (v === "theory") renderHalves();
    if (v === "bench" && bench.dirty) requestAnimationFrame(() => drawChart(false));
  }
  function moveIndicator() {
    const active = $(".nav-link.is-active");
    const ind = $(".nav-indicator");
    if (!active || !ind) return;
    ind.style.transform = `translateY(${active.offsetTop}px)`;
    ind.style.height = active.offsetHeight + "px";
  }
  addEventListener("hashchange", route);
  addEventListener("resize", moveIndicator);
  const go = (v) => { location.hash = "#/" + v; };

  /* =========================================================================
     DATASET
     ========================================================================= */
  // source tabs
  $$(".seg-btn[data-src]").forEach((b) => b.addEventListener("click", () => {
    $$(".seg-btn[data-src]").forEach((x) => { const on = x === b; x.classList.toggle("is-on", on); x.setAttribute("aria-selected", on); });
    $$(".src-pane").forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.src));
  }));

  // presets
  const genN = $("#genN");
  $$("#genForm .chip").forEach((c) => c.addEventListener("click", () => {
    genN.value = fmt(+c.dataset.n);
    syncChips();
  }));
  function syncChips() {
    const n = parseIntLoose(genN.value);
    $$("#genForm .chip").forEach((c) => c.classList.toggle("is-on", +c.dataset.n === n));
  }
  genN.addEventListener("input", syncChips);
  genN.addEventListener("blur", () => { const n = parseIntLoose(genN.value); if (n > 0) genN.value = fmt(n); });

  $("#genForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const n = parseIntLoose(genN.value);
    if (!Number.isFinite(n) || n < 1) return invalid(genN, "Enter a whole number of entries (e.g. 10000 or 10k).");
    const seedRaw = $("#genSeed").value.trim();
    if (seedRaw && !/^\d+$/.test(seedRaw)) return invalid($("#genSeed"), "Seed must be a whole number.");
    withBusy($("#genBtn"), async () => {
      try {
        const s = await api("/api/generate", { n, seed: seedRaw === "" ? null : +seedRaw });
        setSummary(s);
        browse.offset = 0; loadBrowse();
        toast(s.message, s.capped ? "info" : "ok");
      } catch (err) { toast(err.message, "err"); }
    });
  });

  // file upload
  const drop = $("#drop"), fileInput = $("#fileInput"), fileStatus = $("#fileStatus");
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); } });
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("is-over"); }));
  drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) uploadFile(f); });
  fileInput.addEventListener("change", () => { const f = fileInput.files[0]; if (f) uploadFile(f); fileInput.value = ""; });

  function setFileStatus(kind, html) { fileStatus.hidden = false; fileStatus.className = `file-status ${kind}`; fileStatus.innerHTML = html; }

  async function uploadFile(file) {
    if (file.size > 60 * 1024 * 1024) return setFileStatus("err", "File is larger than 60 MB.");
    setFileStatus("busy", `<span class="spinner"></span> Reading <b>${esc(file.name)}</b>…`);
    try {
      const buf = await file.arrayBuffer();
      // base64 in chunks (avoids call-stack limits on big files)
      let bin = ""; const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      setFileStatus("busy", `<span class="spinner"></span> Cleaning &amp; sorting <b>${esc(file.name)}</b>…`);
      const s = await api("/api/load", { filename: file.name, content_b64: btoa(bin) });
      setSummary(s);
      browse.offset = 0; loadBrowse();
      setFileStatus("ok", `✓ ${esc(s.message)} from <b>${esc(file.name)}</b>`);
      toast(s.message, "ok");
    } catch (err) {
      setFileStatus("err", `✕ ${esc(err.message)}`);
    }
  }

  // profile
  function renderProfile() {
    const s = app.summary, has = s.n > 0;
    $("#profileEmpty").hidden = has;
    $("#profileBody").hidden = !has;
    $("#profile").classList.toggle("is-filled", has);
    if (!has) return;
    $("#pfN").textContent = fmt(s.n);
    $("#pfLen").textContent = s.avg_len.toFixed(1);
    $("#pfFirst").textContent = s.first; $("#pfFirst").title = s.first;
    $("#pfLast").textContent = s.last; $("#pfLast").title = s.last;

    const L = s.letters || {};
    const letters = "abcdefghijklmnopqrstuvwxyz".split("");
    const max = Math.max(1, ...Object.values(L));
    $("#letters").innerHTML = letters.map((c, i) => {
      const v = L[c] || 0;
      return `<div class="letter" tabindex="0" data-letter="${c}" data-tip="${c.toUpperCase()} · ≈${fmt(v)} entries — click to browse">
        <div class="letter-bar" style="height:${(v / max) * 100}%;animation-delay:${i * 14}ms"></div>
        <div class="letter-l">${c}</div></div>`;
    }).join("");
  }
  $("#letters").addEventListener("click", (e) => { const l = e.target.closest(".letter"); if (l) { $("#browseQ").value = l.dataset.letter; loadBrowse(l.dataset.letter); } });
  $("#letters").addEventListener("keydown", (e) => { if (e.key === "Enter") e.target.closest(".letter")?.click(); });

  // browse
  const browse = { offset: 0, limit: 25, hit: null };
  async function loadBrowse(q) {
    if (!app.summary.n) return;
    const qs = new URLSearchParams({ offset: browse.offset, limit: browse.limit });
    if (q) qs.set("q", q);
    try {
      const d = await api("/api/browse?" + qs);
      browse.offset = d.offset;
      browse.hit = q ? d.offset : null;
      $("#browseRows").innerHTML = d.rows.length
        ? d.rows.map((r) => `<li class="${r.i === browse.hit ? "is-hit" : ""}"><span class="ri">${fmt(r.i)}</span><span>${esc(r.v)}</span></li>`).join("")
        : `<li><span></span><span class="muted">Empty</span></li>`;
      $("#browseRows").scrollTop = 0;
      const end = Math.min(d.n, d.offset + d.limit);
      $("#pgInfo").textContent = `${fmt(d.offset)}–${fmt(end - 1)} of ${fmt(d.n)}`;
      $("#pgPrev").disabled = d.offset === 0;
      $("#pgNext").disabled = end >= d.n;
    } catch (err) { toast(err.message, "err"); }
  }
  $("#pgPrev").addEventListener("click", () => { browse.offset = Math.max(0, browse.offset - browse.limit); loadBrowse(); });
  $("#pgNext").addEventListener("click", () => { browse.offset += browse.limit; loadBrowse(); });
  $("#browseForm").addEventListener("submit", (e) => { e.preventDefault(); const q = $("#browseQ").value.trim(); q ? loadBrowse(q) : (browse.offset = 0, loadBrowse()); });
  $("#browseQ").addEventListener("input", debounce(() => { const q = $("#browseQ").value.trim(); if (q) loadBrowse(q); }, 220));

  /* =========================================================================
     EXACT SEARCH
     ========================================================================= */
  const searchQ = $("#searchQ"), searchOut = $("#searchOut");

  $("#searchForm").addEventListener("submit", (e) => { e.preventDefault(); runSearch(searchQ.value); });

  async function randomWord() {
    const n = app.summary.n;
    const d = await api(`/api/browse?offset=${Math.floor(Math.random() * n)}&limit=1`);
    return d.rows[0]?.v;
  }
  $("#randomKey").addEventListener("click", async () => {
    try { const w = await randomWord(); if (w) { searchQ.value = w; runSearch(w); } } catch (err) { toast(err.message, "err"); }
  });

  async function runSearch(raw) {
    const key = String(raw || "").trim();
    if (!app.summary.n) { toast("Load or generate a dataset first.", "err"); return go("dataset"); }
    if (!key) return invalid(searchQ, "Search text cannot be empty.");
    searchOut.innerHTML = `<div class="skel" aria-label="Searching"><span></span><span></span><span></span></div>`;
    await withBusy($("#searchBtn"), async () => {
      try {
        const r = await api("/api/search", { key });
        renderSearch(r);
      } catch (err) {
        searchOut.innerHTML = `<div class="empty empty-sm"><h3>Search failed</h3><p>${esc(err.message)}</p></div>`;
      }
    });
  }

  function renderSearch(r) {
    const ratio = r.linear.steps / Math.max(1, r.binary.steps);
    const timeRatio = r.linear.ms / Math.max(1e-9, r.binary.ms);
    const maxSteps = Math.max(r.linear.steps, r.binary.steps);
    const pct = (v) => Math.max(0.25, (v / maxSteps) * 100);

    const verdict = r.found
      ? `<span class="badge badge-ok">Found</span>
         <h2><span class="mono">“${esc(r.key)}”</span> at index <span class="mono">${fmt(r.index)}</span></h2>
         <span class="muted">${r.first_occurrence !== r.index ? `first occurrence at ${fmt(r.first_occurrence)} (duplicates)` : "first occurrence: same index"}</span>`
      : `<span class="badge badge-miss">Not found</span>
         <h2><span class="mono">“${esc(r.key)}”</span> isn't in the list</h2>
         <span class="muted">it would be inserted at index ${fmt(r.insertion_point)}</span>`;

    const trace = r.binary.trace.map((p, i) => {
      const L = (p.low / r.n) * 100, W = ((p.high - p.low + 1) / r.n) * 100, M = ((p.mid + 0.5) / r.n) * 100;
      const cmp = p.cmp === "eq" ? "= match" : p.cmp === "lt" ? "&lt; right" : "&gt; left";
      const final = i === r.binary.trace.length - 1;
      return `<li class="probe ${final && p.cmp === "eq" ? "is-final" : ""}" style="animation-delay:${Math.min(i * 70, 1400)}ms">
        <span class="probe-n">${String(i + 1).padStart(2, "0")}</span>
        <div class="probe-range" data-tip="low ${fmt(p.low)} · mid ${fmt(p.mid)} · high ${fmt(p.high)} — ${fmt(p.high - p.low + 1)} left">
          <span class="pr-track"></span><span class="pr-win" style="left:${L}%;width:${W}%"></span><span class="pr-mid" style="left:${M}%"></span>
        </div>
        <span class="probe-val"><span class="pi">[${fmt(p.mid)}]</span>${esc(p.value)}</span>
        <span class="probe-cmp ${p.cmp}">${cmp}</span>
      </li>`;
    }).join("");

    const neigh = r.neighbours.map((x) => {
      const hit = r.found && x.v === r.key && x.i === r.index;
      return (!r.found && x.i === r.insertion_point ? `<li class="is-gap"><span class="ri">↳</span><span>“${esc(r.key)}” would go here</span></li>` : "") +
        `<li class="${hit ? "is-hit" : ""}"><span class="ri">${fmt(x.i)}</span><span>${esc(x.v)}</span></li>`;
    }).join("") + (!r.found && r.insertion_point >= r.n ? `<li class="is-gap"><span class="ri">↳</span><span>“${esc(r.key)}” would go here (end)</span></li>` : "");

    searchOut.innerHTML = `
      <div class="verdict">${verdict}</div>

      <div class="race">
        <div class="race-cell race-cell-hero">
          <div class="race-k"><i class="sw sw-binary"></i>Binary · iterative</div>
          <div class="race-big">${fmt(r.binary.steps)}<small>comparisons</small></div>
          <div class="race-sub">${fmtMs(r.binary.ms)} · avg of 100 runs</div>
        </div>
        <div class="race-cell">
          <div class="race-k"><i class="sw sw-binary"></i>Binary · recursive</div>
          <div class="race-big">${fmt(r.recursive.steps)}<small>comparisons</small></div>
          <div class="race-sub">${r.recursive.steps === r.binary.steps ? "same path, O(log n) stack" : "differs from iterative"}</div>
        </div>
        <div class="race-cell">
          <div class="race-k"><i class="sw sw-linear"></i>Linear scan</div>
          <div class="race-big">${fmt(r.linear.steps)}<small>comparisons</small></div>
          <div class="race-sub">${fmtMs(r.linear.ms)}</div>
        </div>
      </div>

      <div class="scale-compare" aria-label="Comparisons drawn to scale">
        <div class="sc-row"><span>Binary</span><div class="sc-track"><div class="sc-fill fill-binary" style="width:${pct(r.binary.steps)}%"></div></div><span>${fmt(r.binary.steps)}</span></div>
        <div class="sc-row"><span>Linear</span><div class="sc-track"><div class="sc-fill" style="background:var(--linear);width:${pct(r.linear.steps)}%"></div></div><span>${fmt(r.linear.steps)}</span></div>
        <p class="note">Binary search used <b class="mono">${ratio >= 10 ? fmt(Math.round(ratio)) : ratio.toFixed(1)}×</b> fewer comparisons${timeRatio > 1.5 ? ` and ran <b class="mono">${fmt(Math.round(timeRatio))}×</b> faster` : ""}. Theory says at most <b class="mono">${Math.floor(r.log2n) + 1}</b> probes for n = ${fmt(r.n)}.</p>
      </div>

      <div class="two-col">
        <div>
          <div class="trace-head">
            <h3>Probe trace</h3>
            <span class="muted small">each bar is the remaining <span class="mono">[low, high]</span> window over the whole list</span>
          </div>
          <ol class="trace">${trace}</ol>
        </div>
        <div>
          <div class="trace-head"><h3>Neighbourhood</h3><span class="muted small">sorted order around the target</span></div>
          <ol class="neigh">${neigh}</ol>
          ${r.resorted ? `<p class="note">The list was unsorted, so it was sorted first.</p>` : ""}
        </div>
      </div>`;
  }

  /* =========================================================================
     AUTOCOMPLETE
     ========================================================================= */
  const prefixQ = $("#prefixQ"), acList = $("#acList");
  let acCtl = null, acSel = -1, acItems = [];

  const runPrefix = debounce(async () => {
    const p = prefixQ.value.trim();
    acSel = -1;
    if (!p) {
      acList.innerHTML = ""; acItems = [];
      $("#acCount").textContent = "Type at least one letter.";
      prefixQ.setAttribute("aria-expanded", "false");
      ["#acLb", "#acWalk", "#acTotal", "#acStart", "#acMs"].forEach((s) => ($(s).textContent = "—"));
      $("#acLbBar").style.width = "0"; $("#acWalkBar").style.width = "0";
      return;
    }
    acCtl?.abort(); acCtl = new AbortController();
    $("#acCount").innerHTML = `<span class="muted">Searching…</span>`;
    try {
      const r = await api("/api/prefix", { prefix: p }, { signal: acCtl.signal });
      renderPrefix(r);
    } catch (err) {
      if (err.name === "AbortError") return;
      $("#acCount").textContent = err.message;
      acList.innerHTML = "";
    }
  }, 110);
  prefixQ.addEventListener("input", runPrefix);

  function renderPrefix(r) {
    acItems = r.matches;
    const pl = r.prefix.length;
    $("#acCount").innerHTML = r.total
      ? `<b class="mono">${fmt(r.total)}</b> match${r.total === 1 ? "" : "es"} for <span class="mono">“${esc(r.prefix)}”</span>${r.truncated ? ` · showing first ${fmt(r.matches.length)}` : ""}`
      : `No words start with <span class="mono">“${esc(r.prefix)}”</span>.`;
    acList.innerHTML = r.total
      ? r.matches.map((m, i) => `<li role="option" id="ac-${i}" data-i="${i}" aria-selected="false" style="animation-delay:${Math.min(i, 30) * 8}ms"><span><b>${esc(m.slice(0, pl))}</b>${esc(m.slice(pl))}</span><span class="ai">${fmt(r.start + i)}</span></li>`).join("") +
        (r.truncated ? `<li class="ac-more" aria-disabled="true">+ ${fmt(r.total - r.matches.length)} more…</li>` : "")
      : `<li class="ac-empty" aria-disabled="true">Nothing here — try a shorter prefix.</li>`;
    prefixQ.setAttribute("aria-expanded", r.total ? "true" : "false");

    $("#acLb").textContent = fmt(r.lower_bound_steps);
    $("#acWalk").textContent = fmt(r.walk_steps);
    $("#acTotal").textContent = fmt(r.steps);
    $("#acStart").textContent = fmt(r.start);
    $("#acMs").textContent = fmtMs(r.ms);
    const tot = Math.max(1, r.steps);
    $("#acLbBar").style.width = (r.lower_bound_steps / tot) * 100 + "%";
    $("#acWalkBar").style.width = (r.walk_steps / tot) * 100 + "%";
  }

  function acSelect(i) {
    const lis = $$("li[role=option]", acList);
    if (!lis.length) return;
    acSel = (i + lis.length) % lis.length;
    lis.forEach((li, j) => li.setAttribute("aria-selected", j === acSel));
    lis[acSel].scrollIntoView({ block: "nearest" });
    prefixQ.setAttribute("aria-activedescendant", lis[acSel].id);
  }
  function acPick(i) {
    const word = acItems[i];
    if (!word) return;
    searchQ.value = word;
    go("search");
    runSearch(word);
  }
  prefixQ.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); acSelect(acSel + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); acSelect(acSel - 1); }
    else if (e.key === "Enter" && acSel >= 0) { e.preventDefault(); acPick(acSel); }
  });
  acList.addEventListener("click", (e) => { const li = e.target.closest("li[role=option]"); if (li) acPick(+li.dataset.i); });

  /* =========================================================================
     ADD & DELETE
     ========================================================================= */
  const editLog = [];
  function logEdit(op, text, cls) {
    const t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    editLog.unshift({ t, op, text, cls });
    $("#editLog").innerHTML = editLog.slice(0, 12).map((x) => `<li><span class="lt">${x.t}</span><span class="${x.cls}">${x.op}</span><span>${esc(x.text)}</span></li>`).join("");
  }
  function renderEdit(kind, r, word) {
    const rows = r.neighbours.map((x) => `<li class="${kind === "add" && x.i === r.index ? "is-hit" : ""}"><span class="ri">${fmt(x.i)}</span><span>${esc(x.v)}</span></li>`).join("");
    const gap = kind === "del" ? `<li class="is-gap"><span class="ri">✕</span><span>“${esc(word)}” removed from ${fmt(r.index)}</span></li>` : "";
    const out = $("#editOut");
    out.classList.add("is-filled");
    out.innerHTML = `<div class="edit-res">
      <div>
        <span class="badge ${kind === "add" ? "badge-ok" : "badge-miss"}">${kind === "add" ? "Inserted" : "Deleted"}</span>
        <h3><span class="mono">“${esc(word)}”</span> ${kind === "add" ? "landed at" : "was at"} index <span class="mono">${fmt(r.index)}</span></h3>
        <p>${kind === "add" ? `Located with ${fmt(r.steps)} binary probes; the list now has ${fmt(r.n)} entries and is still sorted.` : `Found with ${fmt(r.steps)} binary probes, then removed. ${fmt(r.n)} entries remain.`}</p>
      </div>
      <ol class="neigh">${kind === "del" ? gap + rows : rows}</ol></div>`;
  }

  $("#addForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const inp = $("#addQ"), word = inp.value.trim().toLowerCase();
    if (!word) return invalid(inp, "Cannot add an empty entry.");
    withBusy($("#addBtn"), async () => {
      try {
        const r = await api("/api/add", { item: word });
        setSummary(r); renderEdit("add", r, word); logEdit("ADD", `${word} → ${fmt(r.index)}`, "op-add");
        toast(r.message, "ok"); inp.value = ""; inp.focus();
        browse.offset = 0; loadBrowse(word);
      } catch (err) { toast(err.message, "err"); logEdit("ERR", err.message, "op-err"); }
    });
  });

  $("#delForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const inp = $("#delQ"), word = inp.value.trim().toLowerCase();
    if (!app.summary.n) return toast("No data loaded.", "err");
    if (!word) return invalid(inp, "Cannot delete an empty entry.");
    withBusy($("#delBtn"), async () => {
      try {
        const r = await api("/api/delete", { item: word });
        setSummary(r); renderEdit("del", r, word); logEdit("DEL", `${word} ✕ ${fmt(r.index)}`, "op-del");
        toast(r.message, "ok"); inp.value = ""; inp.focus();
        loadBrowse();
      } catch (err) {
        if (err.status === 404) invalid(inp);
        toast(err.message, "err"); logEdit("ERR", err.message, "op-err");
      }
    });
  });

  /* =========================================================================
     BENCHMARK
     ========================================================================= */
  const bench = { results: [], metric: "steps", running: false };

  $$("#benchSizes .chip").forEach((c) => c.addEventListener("click", () => {
    if (bench.running) return;
    const on = !c.classList.contains("is-on");
    c.classList.toggle("is-on", on); c.setAttribute("aria-pressed", on);
    $("#benchBtn").disabled = !$$("#benchSizes .chip.is-on").length;
  }));
  $$("#metricSeg .seg-btn").forEach((b) => b.addEventListener("click", () => {
    $$("#metricSeg .seg-btn").forEach((x) => { const on = x === b; x.classList.toggle("is-on", on); x.setAttribute("aria-selected", on); });
    bench.metric = b.dataset.metric;
    if (bench.results.length) drawChart(false);
  }));

  $("#benchBtn").addEventListener("click", () => {
    const sizes = $$("#benchSizes .chip.is-on").map((c) => +c.dataset.n).sort((a, b) => a - b);
    if (!sizes.length) return toast("Pick at least one size.", "err");
    bench.running = true; bench.results = [];
    $$("#benchSizes .chip").forEach((c) => (c.disabled = true));
    const prog = $("#benchProgress"); prog.hidden = false; prog.firstElementChild.style.width = "0";
    renderTable(); drawChart();
    withBusy($("#benchBtn"), async () => {
      try {
        for (let i = 0; i < sizes.length; i++) {
          $("#benchBtn .btn-label").textContent = `Running n = ${fmtShort(sizes[i])}…`;
          prog.firstElementChild.style.width = ((i + 0.35) / sizes.length) * 100 + "%";
          const d = await api("/api/benchmark", { sizes: [sizes[i]] });
          bench.results.push(d.results[0]);
          prog.firstElementChild.style.width = ((i + 1) / sizes.length) * 100 + "%";
          renderTable(d.results[0].n); drawChart();
        }
        toast(`Benchmark complete — ${sizes.length} size${sizes.length > 1 ? "s" : ""}.`, "ok");
      } catch (err) { toast(err.message, "err"); }
      finally {
        bench.running = false;
        $("#benchBtn .btn-label").textContent = "Run again";
        $$("#benchSizes .chip").forEach((c) => (c.disabled = false));
        setTimeout(() => (prog.hidden = true), 700);
      }
    });
  });

  function renderTable(newN) {
    const tb = $("#benchTable tbody");
    if (!bench.results.length) { tb.innerHTML = `<tr class="t-empty"><td colspan="7">${bench.running ? "Running…" : "Results will appear here."}</td></tr>`; return; }
    tb.innerHTML = bench.results.map((r) => `<tr class="${r.n === newN ? "is-new" : ""}">
      <td>${fmt(r.n)}</td><td>${fmt(r.linear_steps)}</td><td>${r.binary_steps}</td><td>${r.log2n.toFixed(2)}</td>
      <td>${(r.linear_time * 1000).toFixed(4)}</td><td>${(r.binary_time * 1000).toFixed(5)}</td>
      <td class="speed">${fmt(Math.round(r.linear_steps / r.binary_steps))}×</td></tr>`).join("");
  }

  function niceLogDomain(vals) {
    const lo = Math.min(...vals), hi = Math.max(...vals);
    return [Math.pow(10, Math.floor(Math.log10(lo))), Math.pow(10, Math.ceil(Math.log10(hi) + (hi === lo ? 1 : 0)))];
  }
  const tickLabel = (v, isTime) => {
    if (isTime) { if (v >= 1000) return v / 1000 + " s"; if (v >= 1) return v + " ms"; if (v >= 0.001) return v * 1000 + " µs"; return v * 1e6 + " ns"; }
    return v >= 1e6 ? v / 1e6 + "M" : v >= 1e3 ? v / 1e3 + "K" : String(v);
  };

  function drawChart(animate = true) {
    const host = $("#chart");
    const rs = bench.results;
    $("#chartEmpty").hidden = rs.length > 0 || bench.running;
    $$("svg, .chart-tip", host).forEach((n) => n.remove());
    if (!rs.length) return;
    if (!host.clientWidth || !host.clientHeight) { bench.dirty = true; return; } // hidden view: redraw on show
    bench.dirty = false;

    const isTime = bench.metric === "time";
    const get = (r, s) => isTime ? r[s + "_time"] * 1000 : r[s + "_steps"];
    const W = host.clientWidth, H = host.clientHeight;
    const m = { t: 16, r: 128, b: 38, l: 62 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;

    const xs = rs.map((r) => r.n);
    const [x0, x1] = rs.length === 1 ? [xs[0] / 10, xs[0] * 10] : niceLogDomain(xs);
    const ys = rs.flatMap((r) => [get(r, "binary"), get(r, "linear")]).filter((v) => v > 0);
    const [y0, y1] = niceLogDomain(ys);
    const X = (v) => m.l + ((Math.log10(v) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0))) * iw;
    const Y = (v) => m.t + ih - ((Math.log10(Math.max(v, y0)) - Math.log10(y0)) / (Math.log10(y1) - Math.log10(y0))) * ih;

    const xt = []; for (let v = x0; v <= x1 * 1.0001; v *= 10) xt.push(v);
    const yt = []; for (let v = y0; v <= y1 * 1.0001; v *= 10) yt.push(v);

    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const series = ["linear", "binary"].map((s) => {
      const pts = rs.map((r) => [X(r.n), Y(get(r, s))]);
      const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join("");
      const last = pts[pts.length - 1], lastR = rs[rs.length - 1];
      return `<g class="series s-${s}">
        <path d="${d}" class="${animate ? "line-draw" : ""}" />
        ${pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="4.5" />`).join("")}
        <text class="dlabel" x="${last[0] + 10}" y="${last[1] + 4}">${s === "binary" ? "Binary" : "Linear"} ${isTime ? fmtMs(get(lastR, s)) : fmt(get(lastR, s))}</text>
      </g>`;
    }).join("");

    svg.innerHTML = `
      <g class="grid">${yt.map((v) => `<line x1="${m.l}" x2="${m.l + iw}" y1="${Y(v)}" y2="${Y(v)}" />`).join("")}</g>
      <g class="axis">
        ${yt.map((v) => `<text x="${m.l - 10}" y="${Y(v) + 4}" text-anchor="end">${tickLabel(v, isTime)}</text>`).join("")}
        ${xt.map((v) => `<text x="${X(v)}" y="${m.t + ih + 20}" text-anchor="middle">${tickLabel(v, false)}</text>`).join("")}
        <text class="axis-title" x="${m.l + iw / 2}" y="${H - 2}" text-anchor="middle">n (dataset size)</text>
      </g>
      <line class="crosshair" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" visibility="hidden" />
      ${series}
      <g class="hits">${rs.map((r, i) => {
        const cx = X(r.n);
        const prev = i ? X(rs[i - 1].n) : m.l, next = i < rs.length - 1 ? X(rs[i + 1].n) : m.l + iw;
        const a = i ? (prev + cx) / 2 : m.l, b = i < rs.length - 1 ? (cx + next) / 2 : m.l + iw;
        return `<rect class="hit" data-i="${i}" x="${a}" y="${m.t}" width="${Math.max(1, b - a)}" height="${ih}" />`;
      }).join("")}</g>`;
    host.appendChild(svg);
    $$(".line-draw", svg).forEach((p) => p.style.setProperty("--len", p.getTotalLength()));

    const tipEl = document.createElement("div");
    tipEl.className = "chart-tip"; tipEl.style.opacity = 0;
    host.appendChild(tipEl);
    const cross = $(".crosshair", svg);
    svg.addEventListener("mousemove", (e) => {
      const hit = e.target.closest(".hit"); if (!hit) return;
      const r = rs[+hit.dataset.i], cx = X(r.n);
      cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("visibility", "visible");
      tipEl.innerHTML = `<h4>n = ${fmt(r.n)}</h4>
        <div><span><i class="sw sw-binary"></i>Binary</span><span>${r.binary_steps} cmp · ${fmtMs(r.binary_time * 1000)}</span></div>
        <div><span><i class="sw sw-linear"></i>Linear</span><span>${fmt(r.linear_steps)} cmp · ${fmtMs(r.linear_time * 1000)}</span></div>
        <div><span>Ratio</span><span>${fmt(Math.round(r.linear_steps / r.binary_steps))}× fewer</span></div>`;
      const sx = (cx / W) * host.clientWidth;
      tipEl.style.left = Math.max(100, Math.min(sx, host.clientWidth - 100)) + "px";
      tipEl.style.top = Math.max(60, Y(get(r, "linear"))) + "px";
      tipEl.style.opacity = 1;
    });
    svg.addEventListener("mouseleave", () => { tipEl.style.opacity = 0; cross.setAttribute("visibility", "hidden"); });
  }
  addEventListener("resize", debounce(() => bench.results.length && drawChart(false), 150));

  /* =========================================================================
     THEORY — halving slider
     ========================================================================= */
  function renderHalves() {
    const n = Math.max(1, Math.round(Math.pow(10, +$("#hvRange").value)));
    $("#hvN").textContent = fmt(n); $("#hvN2").textContent = fmt(n);
    const seq = []; let k = n; while (k >= 1) { seq.push(k); k = Math.floor(k / 2); }
    $("#halves").innerHTML = seq.map((v, i) => `<li><span class="hn">${i + 1}</span><span class="hb" style="width:${Math.max(0.6, (Math.log2(v + 1) / Math.log2(n + 1)) * 100)}%"></span><span class="hv">${fmt(v)}</span></li>`).join("");
    $("#hvSteps").textContent = seq.length;
  }
  $("#hvRange").addEventListener("input", renderHalves);

  /* =========================================================================
     Keyboard shortcuts
     ========================================================================= */
  const help = $("#helpDialog");
  $("#helpBtn").addEventListener("click", () => help.showModal());
  document.addEventListener("keydown", (e) => {
    const typing = e.target.matches("input, textarea, select, [contenteditable]");
    if (e.key === "Escape" && typing) { e.target.blur(); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey || help.open) return;
    const view = (location.hash.match(/^#\/(\w+)/) || [])[1] || "dataset";
    if (/^[1-6]$/.test(e.key)) { go(VIEWS[+e.key - 1]); e.preventDefault(); }
    else if (e.key === "/") { e.preventDefault(); if (view === "prefix") prefixQ.focus(); else { go("search"); setTimeout(() => searchQ.focus(), 30); } }
    else if (e.key.toLowerCase() === "t") toggleTheme();
    else if (e.key.toLowerCase() === "r" && app.summary.n) { go("search"); $("#randomKey").click(); }
    else if (e.key === "?") help.showModal();
  });

  /* ───────────── boot ───────────── */
  route();
  api("/api/state").then((s) => { setSummary(s); if (s.n) loadBrowse(); })
    .catch((err) => { setSummary({ n: 0 }); toast(err.message, "err", 8000); });
  renderHalves();
})();
