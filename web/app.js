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

  const DIST_HINT = {
    uniform: "Every letter equally likely. Interpolation search's best case.",
    skewed: "First letters follow a Zipf law, like real names: lots of a/b/c, few x/y/z.",
    clustered: "95% of words start with “s”.",
    exponential: "Words pile up near “a” (a, aa, aaa…). Interpolation search's worst case.",
  };
  $("#genDist").addEventListener("change", () => ($("#genDistHint").textContent = DIST_HINT[$("#genDist").value]));

  $("#genForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const n = parseIntLoose(genN.value);
    if (!Number.isFinite(n) || n < 1) return invalid(genN, "Enter a whole number of entries (e.g. 10000 or 10k).");
    const seedRaw = $("#genSeed").value.trim();
    if (seedRaw && !/^\d+$/.test(seedRaw)) return invalid($("#genSeed"), "Seed must be a whole number.");
    withBusy($("#genBtn"), async () => {
      try {
        const s = await api("/api/generate", { n, seed: seedRaw === "" ? null : +seedRaw, distribution: $("#genDist").value });
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
      return `<li class="probe ${final && p.cmp === "eq" ? "is-final" : ""}" data-i="${i}" title="Show this step" style="animation-delay:${Math.min(i * 70, 1400)}ms">
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

      <section class="board panel" id="board" aria-label="Algorithm leaderboard">
        <div class="board-head">
          <div><h3>Leaderboard</h3><span class="muted small">Same key, same list of ${fmt(r.n)} entries. Ranked by comparisons.</span></div>
          <div class="seg seg-sm" role="tablist" aria-label="Bar scale" id="boardScale">
            <button role="tab" class="seg-btn" data-scale="log">Log scale</button>
            <button role="tab" class="seg-btn" data-scale="linear">Linear scale</button>
          </div>
        </div>
        <ol class="board-rows"></ol>
        <p class="note">Binary search used <b class="mono">${ratio >= 10 ? fmt(Math.round(ratio)) : ratio.toFixed(1)}×</b> fewer comparisons than a linear scan${timeRatio > 1.5 ? ` and ran <b class="mono">${fmt(Math.round(timeRatio))}×</b> faster` : ""}. Theory says at most <b class="mono">${Math.floor(r.log2n) + 1}</b> probes for n = ${fmt(r.n)}.</p>
      </section>

      <section class="stepper panel" id="stepper" aria-label="Step through binary search"></section>

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
    renderBoard(r);
    initStepper(r);
  }

  /* =========================================================================
     LEADERBOARD — every algorithm on one ranked list
     ========================================================================= */
  function renderBoard(r) {
    const rows = [
      { sw: "binary", name: "Binary search", sub: "iterative", big: "O(log n)", d: r.binary },
      { sw: "binary", name: "Binary search", sub: "recursive · O(log n) stack", big: "O(log n)", d: r.recursive },
      { sw: "interp", name: "Interpolation", sub: "guesses the position", big: "O(log log n)", d: r.interpolation },
      { sw: "exp", name: "Exponential", sub: "gallop, then halve", big: "O(log i)", d: r.exponential },
      { sw: "jump", name: "Jump", sub: `blocks of √n = ${fmt(r.jump.block)}`, big: "O(√n)", d: r.jump },
      { sw: "linear", name: "Linear scan", sub: "checks every entry", big: "O(n)", d: r.linear },
    ].sort((a, b) => a.d.steps - b.d.steps);   // stable: ties keep this order
    const fewest = rows[0].d.steps;
    const fastest = Math.min(...rows.map((x) => x.d.ms));
    const max = Math.max(...rows.map((x) => x.d.steps));
    const scale = store.get("boardScale", "log");
    const width = (v) => scale === "log"
      ? Math.max(1.5, (Math.log10(v + 1) / Math.log10(max + 1)) * 100)
      : Math.max(0.4, (v / max) * 100);
    $$("#boardScale .seg-btn").forEach((b) => {
      const on = b.dataset.scale === scale;
      b.classList.toggle("is-on", on); b.setAttribute("aria-selected", on);
      b.onclick = () => { store.set("boardScale", b.dataset.scale); renderBoard(r); };
    });
    $("#board .board-rows").innerHTML = rows.map((x, i) => `
      <li class="brow ${x.d.steps === fewest ? "is-best" : ""}">
        <span class="b-rank mono">${i + 1}</span>
        <span class="b-name"><i class="sw sw-${x.sw}"></i><b>${x.name}</b><small>${esc(x.sub)}</small></span>
        <span class="b-big mono">${x.big}</span>
        <span class="b-track"><span class="b-fill" style="width:${width(x.d.steps)}%;background:var(--${x.sw})"></span></span>
        <span class="b-steps mono"><b>${fmt(x.d.steps)}</b><small>cmp</small></span>
        <span class="b-ms mono">${fmtMs(x.d.ms)}</span>
        <span class="b-tags">${x.d.steps === fewest ? `<em class="tag tag-best">fewest</em>` : ""}${x.d.ms === fastest ? `<em class="tag tag-fast">fastest</em>` : ""}</span>
      </li>`).join("");
  }

  /* =========================================================================
     STEP-THROUGH — replay binary search one probe at a time
     ========================================================================= */
  const step = { r: null, frames: [], i: 0, timer: null };

  /* One frame per probe, plus a final "window is empty" frame for a miss. */
  function buildFrames(r) {
    const frames = r.binary.trace.map((p, i) => ({ ...p, k: i }));
    if (!r.found) {
      const last = r.binary.trace[r.binary.trace.length - 1];
      const low = last ? (last.cmp === "lt" ? last.mid + 1 : last.low) : 0;
      const high = last ? (last.cmp === "gt" ? last.mid - 1 : last.high) : -1;
      frames.push({ empty: true, low, high, k: frames.length });
    }
    return frames;
  }

  function initStepper(r) {
    stopPlay();
    step.r = r; step.frames = buildFrames(r); step.i = 0;
    const host = $("#stepper");
    if (!host) return;
    host.innerHTML = `
      <div class="st-head">
        <div><h3>Step through binary search</h3>
          <span class="muted small">Use <kbd>←</kbd> <kbd>→</kbd> to step and <kbd>Space</kbd> to play. Click a probe below to jump to it.</span></div>
        <div class="st-ctrl" role="group" aria-label="Step controls">
          <button type="button" class="btn btn-ghost btn-sm" data-st="first" aria-label="First step">⏮</button>
          <button type="button" class="btn btn-ghost btn-sm" data-st="prev" aria-label="Previous step">◀ Back</button>
          <button type="button" class="btn btn-primary btn-sm st-play" data-st="play" aria-label="Play">▶ Play</button>
          <button type="button" class="btn btn-ghost btn-sm" data-st="next" aria-label="Next step">Next ▶</button>
          <button type="button" class="btn btn-ghost btn-sm" data-st="last" aria-label="Last step">⏭</button>
        </div>
      </div>
      <div class="st-count mono" aria-live="polite"></div>
      <div class="st-label">This step: the remaining window, zoomed in</div>
      <div class="st-zoom" aria-hidden="true">
        <span class="sz-drop"></span><span class="sz-mid"></span><span class="sz-empty">empty: low &gt; high</span>
      </div>
      <div class="st-zaxis mono" aria-hidden="true"><span class="za-low"></span><span class="za-mid"></span><span class="za-high"></span></div>
      <div class="st-label">Whole list</div>
      <div class="st-bar" aria-hidden="true">
        <span class="st-gone st-gone-l"></span><span class="st-win"></span><span class="st-gone st-gone-r"></span>
        <span class="st-mid"></span>
      </div>
      <div class="st-axis mono" aria-hidden="true"><span>0</span><span>${fmt(r.n - 1)}</span></div>
      <div class="st-ptrs"></div>
      <p class="st-explain"></p>`;
    $$("[data-st]", host).forEach((b) => b.addEventListener("click", () => {
      const a = b.dataset.st;
      if (a === "play") return step.timer ? stopPlay() : startPlay();
      stopPlay();
      if (a === "first") showStep(0);
      else if (a === "prev") showStep(step.i - 1);
      else if (a === "next") showStep(step.i + 1);
      else showStep(step.frames.length - 1);
    }));
    $$(".trace .probe").forEach((li) => li.addEventListener("click", () => { stopPlay(); showStep(+li.dataset.i); }));
    showStep(0);
  }

  function showStep(i) {
    const host = $("#stepper"), r = step.r;
    if (!host || !r) return;
    step.i = Math.max(0, Math.min(step.frames.length - 1, i));
    const f = step.frames[step.i], n = r.n, key = esc(r.key);
    const pc = (v) => (v / n) * 100;
    const left = f.empty ? 0 : f.low, right = f.empty ? 0 : f.high + 1;
    $(".st-count", host).innerHTML = `Step <b>${step.i + 1}</b> of ${step.frames.length} · ` +
      (f.empty ? "window is empty" : `<b>${fmt(f.high - f.low + 1)}</b> of ${fmt(n)} entries still possible`);
    $(".st-gone-l", host).style.width = pc(f.empty ? f.low : left) + "%";
    $(".st-gone-r", host).style.cssText = `left:${pc(f.empty ? f.low : right)}%;right:0`;
    $(".st-win", host).style.cssText = f.empty ? "display:none" : `left:${pc(left)}%;width:${Math.max(0.3, pc(right - left))}%`;
    $(".st-mid", host).style.cssText = f.empty ? "display:none" : `left:${pc(f.mid + 0.5)}%`;

    // Zoomed view: the current [low, high] window stretched to full width.
    const zoom = $(".st-zoom", host);
    zoom.classList.toggle("is-empty", !!f.empty);
    zoom.classList.toggle("is-eq", f.cmp === "eq");
    if (!f.empty) {
      const size = f.high - f.low + 1;
      const zm = ((f.mid - f.low + 0.5) / size) * 100;
      const cut = ((f.mid - f.low + 1) / size) * 100;          // right edge of mid
      const drop = $(".sz-drop", zoom);
      if (f.cmp === "lt") drop.style.cssText = `left:0;width:${cut}%`;
      else if (f.cmp === "gt") drop.style.cssText = `left:${((f.mid - f.low) / size) * 100}%;right:0`;
      else drop.style.cssText = "width:0";
      $(".sz-mid", zoom).style.left = zm + "%";
      $(".za-low", host).textContent = `low ${fmt(f.low)}`;
      $(".za-high", host).textContent = `high ${fmt(f.high)}`;
      const zmid = $(".za-mid", host);
      zmid.textContent = `mid ${fmt(f.mid)}`;
      zmid.style.left = Math.min(85, Math.max(15, zm)) + "%";
    } else {
      $(".za-low", host).textContent = `high ${fmt(f.high)}`;
      $(".za-high", host).textContent = `low ${fmt(f.low)}`;
      $(".za-mid", host).textContent = "";
    }

    const card = (cls, label, idx, word, extra = "") => `<div class="st-ptr ${cls}">
        <span class="st-pl">${label}</span><span class="st-pi mono">[${fmt(idx)}]</span>
        <span class="st-pw mono">${esc(word)}</span>${extra}</div>`;
    if (f.empty) {
      $(".st-ptrs", host).innerHTML = `<div class="st-ptr is-done"><span class="st-pl">result</span>
        <span class="st-pw mono">low = ${fmt(f.low)} &gt; high = ${fmt(f.high)}</span></div>`;
      $(".st-explain", host).innerHTML = `The window is empty, so <b class="mono">“${key}”</b> is <b>not in the list</b>.
        Binary search stops after ${fmt(r.binary.steps)} comparisons. <code>low</code> has stopped exactly where the word would be inserted: index <b class="mono">${fmt(r.insertion_point)}</b>.`;
    } else {
      const rel = f.cmp === "eq" ? "=" : f.cmp === "lt" ? "&lt;" : "&gt;";
      $(".st-ptrs", host).innerHTML =
        card("is-low", "low", f.low, f.low_v) +
        card("is-mid", "mid", f.mid, f.value, `<span class="st-cmp ${f.cmp}">${esc(f.value)} ${rel} ${key}</span>`) +
        card("is-high", "high", f.high, f.high_v);
      const mid = `<code>mid = (${fmt(f.low)} + ${fmt(f.high)}) // 2 = ${fmt(f.mid)}</code>`;
      const size = f.high - f.low + 1;
      let what;
      if (f.cmp === "eq") what = `It matches, so <b>found at index ${fmt(f.mid)}</b> after ${fmt(step.i + 1)} comparison${step.i ? "s" : ""}. A linear scan would have needed ${fmt(r.linear.steps)}.`;
      else if (f.cmp === "lt") what = `“${esc(f.value)}” comes <b>before</b> “${key}”, so the key can only be to the right. Discard the left half: <code>low = mid + 1 = ${fmt(f.mid + 1)}</code>, leaving ${fmt(f.high - f.mid)} of ${fmt(size)}.`;
      else what = `“${esc(f.value)}” comes <b>after</b> “${key}”, so the key can only be to the left. Discard the right half: <code>high = mid − 1 = ${fmt(f.mid - 1)}</code>, leaving ${fmt(f.mid - f.low)} of ${fmt(size)}.`;
      $(".st-explain", host).innerHTML = `${mid}. Compare <b class="mono">“${key}”</b> with <span class="mono">arr[${fmt(f.mid)}]</span>. ${what}`;
    }
    $$(".trace .probe").forEach((li) => li.classList.toggle("is-current", +li.dataset.i === f.k));
    const atEnd = step.i === step.frames.length - 1;
    $('[data-st="next"]', host).disabled = $('[data-st="last"]', host).disabled = atEnd;
    $('[data-st="prev"]', host).disabled = $('[data-st="first"]', host).disabled = step.i === 0;
  }

  function startPlay() {
    if (step.i >= step.frames.length - 1) showStep(0);
    const btn = $('#stepper [data-st="play"]');
    btn.textContent = "⏸ Pause"; btn.setAttribute("aria-label", "Pause");
    step.timer = setInterval(() => {
      if (step.i >= step.frames.length - 1) return stopPlay();
      showStep(step.i + 1);
    }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 1600 : 1100);
  }
  function stopPlay() {
    clearInterval(step.timer); step.timer = null;
    const btn = $('#stepper [data-st="play"]');
    if (btn) { btn.textContent = "▶ Play"; btn.setAttribute("aria-label", "Play"); }
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
        <p>${kind === "add" ? `The list now has ${fmt(r.n)} entries and is still sorted.` : `${fmt(r.n)} entries remain, still sorted.`}</p>
        <dl class="ecost">
          <div><dt>${kind === "add" ? "Find the slot" : "Find the entry"}</dt><dd class="mono">${fmt(r.steps)} comparisons</dd><dd class="ecost-o mono">O(log n)</dd></div>
          <div><dt>${kind === "add" ? "Make room" : "Close the gap"}</dt><dd class="mono">${fmt(Math.max(0, kind === "add" ? r.n - 1 - r.index : r.n - r.index))} entries shifted ${kind === "add" ? "right" : "left"}</dd><dd class="ecost-o mono">O(n)</dd></div>
        </dl>
        <p class="muted small">Searching is cheap, but an array has to move everything after the slot, so ${kind === "add" ? "inserting" : "deleting"} is O(n) overall. A balanced search tree would make both O(log n).</p>
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
  const bench = { results: [], metric: "steps", case: "worst", running: false };
  const CASE_TEXT = {
    worst: "search its <em>last</em> element — linear search's worst case",
    average: "search random words that <em>are</em> in the list — the average case",
    miss: "search random words that are <em>not</em> in the list — every algorithm has to rule them out",
  };
  const SERIES = ["linear", "jump", "exp", "binary", "interp"];
  const NAMES = { linear: "Linear", jump: "Jump", exp: "Exponential", binary: "Binary", interp: "Interpolation" };
  const SHORT = { linear: "Linear", jump: "Jump", exp: "Exp", binary: "Binary", interp: "Interp" };
  const THEORY = { linear: "n", jump: "√n", exp: "log n", binary: "log n", interp: "log log n, worst n" };

  $$("#caseSeg .seg-btn").forEach((b) => b.addEventListener("click", () => {
    if (bench.running) return;
    $$("#caseSeg .seg-btn").forEach((x) => { const on = x === b; x.classList.toggle("is-on", on); x.setAttribute("aria-selected", on); });
    bench.case = b.dataset.case;
    $("#caseText").innerHTML = CASE_TEXT[bench.case];
  }));

  $$("#benchSizes .chip").forEach((c) => c.addEventListener("click", () => {
    if (bench.running) return;
    const on = !c.classList.contains("is-on");
    c.classList.toggle("is-on", on); c.setAttribute("aria-pressed", on);
    $("#benchBtn").disabled = !$$("#benchSizes .chip.is-on").length;
  }));
  $$("#metricSeg .seg-btn").forEach((b) => b.addEventListener("click", () => {
    $$("#metricSeg .seg-btn").forEach((x) => { const on = x === b; x.classList.toggle("is-on", on); x.setAttribute("aria-selected", on); });
    bench.metric = b.dataset.metric;
    if (bench.results.length) { drawChart(false); renderInsights(); }
  }));

  $("#benchBtn").addEventListener("click", () => {
    const sizes = $$("#benchSizes .chip.is-on").map((c) => +c.dataset.n).sort((a, b) => a - b);
    if (!sizes.length) return toast("Pick at least one size.", "err");
    bench.running = true; bench.results = [];
    $$("#benchSizes .chip").forEach((c) => (c.disabled = true));
    $("#benchDist").disabled = true;
    const prog = $("#benchProgress"); prog.hidden = false; prog.firstElementChild.style.width = "0";
    renderTable(); drawChart();
    withBusy($("#benchBtn"), async () => {
      try {
        for (let i = 0; i < sizes.length; i++) {
          $("#benchBtn .btn-label").textContent = `Running n = ${fmtShort(sizes[i])}…`;
          prog.firstElementChild.style.width = ((i + 0.35) / sizes.length) * 100 + "%";
          const d = await api("/api/benchmark", { sizes: [sizes[i]], case: bench.case, distribution: $("#benchDist").value });
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
        $("#benchDist").disabled = false;
        $("#csvBtn").disabled = !bench.results.length;
        setTimeout(() => (prog.hidden = true), 700);
      }
    });
  });

  function renderTable(newN) {
    const tb = $("#benchTable tbody");
    renderInsights();
    if (!bench.results.length) { tb.innerHTML = `<tr class="t-empty"><td colspan="12">${bench.running ? "Running…" : "Results will appear here."}</td></tr>`; return; }
    tb.innerHTML = bench.results.map((r) => `<tr class="${r.n === newN ? "is-new" : ""}">
      <td>${fmt(r.n)}</td>${SERIES.map((s) => `<td>${fmt(r[s + "_steps"])}</td>`).join("")}<td>${r.log2n.toFixed(2)}</td>
      <td>${(r.linear_time * 1000).toFixed(4)}</td><td>${(r.binary_time * 1000).toFixed(5)}</td>
      <td>${fmtMs(r.sort_time * 1000)}</td>
      <td class="speed">${r.break_even_time ? fmt(r.break_even_time) + " searches" : "—"}</td>
      <td class="speed">${fmt(Math.round(r.linear_steps / Math.max(1, r.binary_steps)))}×</td></tr>`).join("");
  }

  /* Least-squares slope of log(y) against log(n): the measured exponent k in y ≈ c·n^k.
     About 1 for O(n), 0.5 for O(√n), close to 0 for anything logarithmic. */
  function slope(s) {
    const pts = bench.results.map((r) => [Math.log(r.n), Math.log(Math.max(1e-12, bench.metric === "time" ? r[s + "_time"] : r[s + "_steps"]))]);
    if (pts.length < 2) return null;
    const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length, my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const num = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0), den = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
    return den ? num / den : null;
  }

  function renderInsights() {
    const box = $("#benchInsights");
    const rs = bench.results;
    if (!rs.length) { box.hidden = true; return; }
    box.hidden = false;
    const last = rs[rs.length - 1];
    $("#slopesPanel").hidden = rs.length < 2;
    $("#slopes").innerHTML = SERIES.map((s) => {
      const k = slope(s);
      return `<li><i class="sw sw-${s}"></i><span>${NAMES[s]}</span><b class="mono">n<sup>${k == null ? "—" : k.toFixed(2)}</sup></b><span class="muted small">theory: ${THEORY[s]}</span></li>`;
    }).join("");
    $("#slopeWhat").textContent = bench.metric === "time" ? "time" : "comparisons";
    $("#breakEven").innerHTML = last.break_even_time
      ? `Sorting ${fmt(last.n)} shuffled words took <b class="mono">${fmtMs(last.sort_time * 1000)}</b>. Each binary search instead of a linear scan saves
         <b class="mono">${fmtMs((last.linear_time - last.binary_time) * 1000)}</b>, so sorting first pays for itself after
         <b class="mono accent-ink">${fmt(last.break_even_time)}</b> searches. Counting comparisons instead (n log₂ n to sort), it's ${fmt(last.break_even_steps)}.`
      : "";
  }

  $("#csvBtn").addEventListener("click", () => {
    if (!bench.results.length) return;
    const cols = ["case", "distribution", "n", "keys", "log2n", ...SERIES.flatMap((s) => [s + "_steps", s + "_time"]), "sort_time", "break_even_steps", "break_even_time"];
    const csv = [cols.join(","), ...bench.results.map((r) => cols.map((c) => r[c] ?? "").join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `bisect-benchmark-${bench.results[0].case}-${bench.results[0].distribution}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  function niceLogDomain(vals, pad = false) {
    const lo = Math.min(...vals), hi = Math.max(...vals);
    let bottom = Math.pow(10, Math.floor(Math.log10(lo)));
    if (pad && lo < bottom * 1.5) bottom /= 10;      // don't draw a line on the axis
    return [bottom, Math.pow(10, Math.ceil(Math.log10(hi) + (hi === lo ? 1 : 0)))];
  }
  const tickLabel = (v, isTime) => {
    if (isTime) { if (v >= 1000) return v / 1000 + " s"; if (v >= 1) return v + " ms"; if (v >= 0.001) return v * 1000 + " µs"; return v * 1e6 + " ns"; }
    return v >= 1e6 ? v / 1e6 + "M" : v >= 1e3 ? v / 1e3 + "K" : String(+v.toPrecision(3));
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
    const ys = rs.flatMap((r) => SERIES.map((s) => get(r, s))).filter((v) => v > 0);
    const [y0, y1] = niceLogDomain(ys, true);
    const X = (v) => m.l + ((Math.log10(v) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0))) * iw;
    const Y = (v) => m.t + ih - ((Math.log10(Math.max(v, y0)) - Math.log10(y0)) / (Math.log10(y1) - Math.log10(y0))) * ih;

    const xt = []; for (let v = x0; v <= x1 * 1.0001; v *= 10) xt.push(v);
    const yt = []; for (let v = y0; v <= y1 * 1.0001; v *= 10) yt.push(v);

    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const series = SERIES.map((s) => {
      const pts = rs.map((r) => [X(r.n), Y(get(r, s))]);
      const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join("");
      const last = pts[pts.length - 1], lastR = rs[rs.length - 1];
      // Binary and exponential sit close together; nudge labels apart.
      const dy = s === "exp" ? -10 : s === "binary" ? 4 : s === "interp" ? 14 : 0;
      return `<g class="series s-${s}">
        <path d="${d}" class="${animate && s !== "exp" && s !== "interp" ? "line-draw" : ""}" />
        ${pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="4.5" />`).join("")}
        <text class="dlabel" x="${last[0] + 10}" y="${last[1] + 4 + dy}">${SHORT[s]} ${isTime ? fmtMs(get(lastR, s)) : fmt(get(lastR, s))}</text>
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
        ${["interp", "exp", "jump", "linear"].map((s) => `<div><span><i class="sw sw-${s}"></i>${NAMES[s]}</span><span>${fmt(r[s + "_steps"])} cmp · ${fmtMs(r[s + "_time"] * 1000)}</span></div>`).join("")}
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
    const typing = !!e.target.matches?.("input, textarea, select, [contenteditable]");
    if (e.key === "Escape" && typing) { e.target.blur(); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey || help.open) return;
    const view = (location.hash.match(/^#\/(\w+)/) || [])[1] || "dataset";
    if (view === "search" && $("#stepper") && ["ArrowLeft", "ArrowRight", " "].includes(e.key)) {
      e.preventDefault();
      if (e.key === " ") return step.timer ? stopPlay() : startPlay();
      stopPlay(); return showStep(step.i + (e.key === "ArrowRight" ? 1 : -1));
    }
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
