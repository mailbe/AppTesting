"use strict";

let currentView = "meter";
const unit = () => settings.weighting === "A" ? "dB(A)" : "dB(Z)";

function levelTone(db) { return db < 45 ? "--ok" : db < 65 ? "--warn" : db < 80 ? "--hot" : "--danger"; }
function levelText(db) {
  if (db < 25) return "Silenzio quasi assoluto";
  if (db < 35) return "Molto silenzioso, ideale per dormire";
  if (db < 45) return "Silenzioso, casa tranquilla";
  if (db < 55) return "Moderato, ambiente domestico attivo";
  if (db < 65) return "Conversazione normale";
  if (db < 75) return "Rumoroso: TV alta, aspirapolvere";
  if (db < 85) return "Molto rumoroso: traffico intenso";
  return "Pericoloso per esposizioni prolungate";
}

const STATUS_ICONS = {
  idle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 12c3-6 5-6 8 0s5 6 8 0"/></svg>',
  calibrating: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>',
  armed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 4v4M5 7l2.5 2.5M19 7l-2.5 2.5"/><circle cx="12" cy="16" r="4"/></svg>',
  recording: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2"/></svg>',
  done: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
  failed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 7v6M12 17v.5"/></svg>'
};

// ---------- Fonometro ----------
const R = 96, C = 2 * Math.PI * R, ARC = 0.75;
const gaugeAngle = (v) => (135 + Math.min(Math.max((v - 20) / 100, 0), 1) * 270) * Math.PI / 180;

function initGauge() {
  $("g-track").setAttribute("stroke-dasharray", `${C * ARC} ${C}`);
  const gt = $("g-ticks");
  for (const v of [20, 40, 60, 80, 100, 120]) {
    const a = gaugeAngle(v);
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("x", (120 + Math.cos(a) * 72).toFixed(1)); t.setAttribute("y", (120 + Math.sin(a) * 72).toFixed(1));
    t.setAttribute("text-anchor", "middle"); t.setAttribute("dominant-baseline", "middle");
    t.textContent = v; gt.appendChild(t);
  }
}

let renderPending = false;
function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => { renderPending = false; renderMeter(); });
}
hooks.level.push(scheduleRender);
hooks.state.push(() => { renderControls(); if (currentView === "tests") renderTests(); });

function renderMeter() {
  const lv = cal(meter.levelFS);
  const ref = refById(settings.reference);
  $("level").textContent = lv == null ? "–" : Math.round(lv);
  $("level").style.color = lv == null ? cssVar("--muted") : cssVar(levelTone(lv));
  $("level-unit").textContent = unit();
  document.querySelectorAll("[data-unit]").forEach((el) => el.textContent = unit());
  const f = lv == null ? 0 : Math.min(Math.max((lv - 20) / 100, 0), 1);
  const bar = $("g-bar");
  bar.setAttribute("stroke-dasharray", `${Math.max(C * ARC * f, 0.01)} ${C}`);
  bar.setAttribute("stroke", lv == null ? cssVar("--track") : cssVar(levelTone(lv)));
  // Tacca della soglia sull'indicatore
  const tick = $("g-ref");
  if (ref.v != null) {
    const a = gaugeAngle(ref.v);
    tick.setAttribute("x1", (120 + Math.cos(a) * 84).toFixed(1)); tick.setAttribute("y1", (120 + Math.sin(a) * 84).toFixed(1));
    tick.setAttribute("x2", (120 + Math.cos(a) * 108).toFixed(1)); tick.setAttribute("y2", (120 + Math.sin(a) * 108).toFixed(1));
    tick.style.display = "";
  } else tick.style.display = "none";

  $("verdict").textContent = lv == null ? (meter.running ? "In ascolto…" : "Premi Avvia per iniziare a misurare") : levelText(lv);
  $("s-min").textContent = fmt(cal(meter.minFS));
  $("s-max").textContent = fmt(cal(meter.maxFS));
  $("s-leq").textContent = fmt(cal(leqFS()));
  $("s-peak").textContent = fmt(cal(meter.peakFS));
  $("s-dur").textContent = fmtDur(meter.elapsed);
  $("s-tw").textContent = settings.time === "fast" ? "Fast" : "Slow";
  $("cal-level").textContent = lv == null ? "Avvia la misura per vederlo" : fmt(lv) + " " + unit();
  if (currentView === "meter") drawHistory($("history-chart"), meter.history, meter.elapsed, ref);

  const leq = cal(leqFS());
  const rs = $("ref-status");
  if (ref.v == null || leq == null) {
    rs.textContent = ref.v == null ? "" : `Soglia: ${ref.v} dB(A), ${ref.src}. Il confronto usa il Leq della misura in corso.`;
    rs.className = "small muted";
  } else {
    const d = leq - ref.v;
    rs.textContent = d <= 0
      ? `Leq ${fmt(leq)} ${unit()}: ${fmt(-d)} dB sotto la soglia di ${ref.v} dB(A) (${ref.src}).`
      : `Leq ${fmt(leq)} ${unit()}: ${fmt(d)} dB sopra la soglia di ${ref.v} dB(A) (${ref.src}).`;
    rs.className = "small ref-" + (d <= 0 ? "ok" : "over");
  }
  $("btn-save").disabled = leq == null;
}

function renderControls() {
  const b = $("btn-start");
  b.textContent = meter.starting ? "Avvio…" : meter.running ? "Stop" : "Avvia";
  b.className = meter.running ? "stop" : "primary";
  const pill = $("live-pill");
  pill.textContent = meter.running ? "In misura" : "Fermo";
  pill.classList.toggle("live", meter.running);
  const n = $("meter-notice");
  if (meter.error) { n.textContent = meter.error; n.className = "notice error"; n.hidden = false; }
  else if (n.classList.contains("error")) n.hidden = true;
  renderMeter();
}

function renderRefSelect() {
  const sel = $("ref-select");
  sel.innerHTML = REFERENCES.map((r) => `<option value="${r.id}" ${r.id === settings.reference ? "selected" : ""}>${esc(r.label)}</option>`).join("");
}

// ---------- Scelta rapida della stanza ----------
function roomNames() {
  const seen = [];
  [...measurements].sort((a, b) => b.date - a.date).forEach((m) => { if (!seen.includes(m.room)) seen.push(m.room); });
  return seen;
}
function renderChips(containerId, inputId) {
  const box = $(containerId); box.innerHTML = "";
  const names = roomNames();
  const defaults = ["Soggiorno", "Camera", "Cucina", "Bagno", "Studio"];
  for (const n of [...names, ...defaults.filter((d) => !names.includes(d))].slice(0, 8)) {
    const c = document.createElement("button"); c.className = "chip"; c.type = "button"; c.textContent = n;
    c.addEventListener("click", () => { $(inputId).value = n; });
    box.appendChild(c);
  }
}

// ---------- Risultati ----------
const TYPE_LABEL = { leq: "Rumore", rt60: "Riverbero", insulation: "Isolamento", facade: "Facciata", impianti: "Impianto", differenziale: "Differenziale" };
let confirmDeleteAll = false;

function energyAvg(levels) {
  if (!levels.length) return null;
  return 10 * Math.log10(levels.reduce((s, v) => s + Math.pow(10, v / 10), 0) / levels.length);
}

function renderResultCharts() {
  const box = $("results-charts");
  let h = "";
  const rooms = roomNames();
  const noise = rooms.map((r) => ({ label: r, value: energyAvg(measurements.filter((m) => m.room === r && m.type === "leq").map((m) => m.leq)) })).filter((x) => x.value != null);
  if (noise.length) {
    noise.forEach((x) => { x.tone = x.value <= 30 ? "good" : x.value <= 35 ? "good2" : x.value <= 45 ? "warn" : "bad"; });
    h += `<figure class="panel fig"><h2>Rumore di fondo per stanza</h2><p class="small muted">LAeq medio in dB(A). Linee: valori guida OMS per la notte (30) e il giorno (35).</p>` +
      barChart({ items: noise, min: 10, max: 70, step: 10, lines: [{ v: 30, label: "OMS notte 30" }, { v: 35, label: "giorno 35" }], title: "Rumore di fondo per stanza" }) + `</figure>`;
  }
  const rts = rooms.map((r) => {
    const v = measurements.filter((m) => m.room === r && m.type === "rt60").map((m) => m.rt60);
    return { label: r, value: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null };
  }).filter((x) => x.value != null);
  if (rts.length) {
    rts.forEach((x) => { x.tone = x.value >= 0.3 && x.value <= 0.6 ? "good" : x.value <= 0.8 ? "warn" : "bad"; });
    h += `<figure class="panel fig"><h2>Riverbero per stanza</h2><p class="small muted">RT60 medio in secondi. Fascia: valori di comfort tipici delle abitazioni.</p>` +
      barChart({ items: rts, min: 0, max: 1.6, step: 0.4, decimals: 1, band: { from: 0.3, to: 0.6, label: "consigliato 0,3–0,6 s" }, title: "Riverbero per stanza" }) + `</figure>`;
  }
  const ins = measurements.filter((m) => m.type === "insulation").sort((a, b) => a.date - b.date);
  if (ins.length) {
    const items = ins.map((m) => ({ label: `${m.from}→${m.room}`, value: m.value, tone: m.wall === "units" ? (m.value >= 50 ? "good" : "bad") : (m.value >= 45 ? "good" : m.value >= 35 ? "warn" : "bad") }));
    h += `<figure class="panel fig"><h2>Isolamento tra stanze</h2><p class="small muted">DnT stimato in dB. Linea: limite di legge tra appartamenti (DPCM 5/12/1997).</p>` +
      barChart({ items, min: 10, max: 70, step: 10, lines: [{ v: 50, label: "legge 50 dB" }], title: "Isolamento tra stanze" }) + `</figure>`;
  }
  const fac = measurements.filter((m) => m.type === "facade").sort((a, b) => a.date - b.date);
  if (fac.length) {
    const items = fac.map((m) => ({ label: m.room, value: m.value, tone: m.value >= 40 ? "good" : "bad" }));
    h += `<figure class="panel fig"><h2>Isolamento di facciata</h2><p class="small muted">D2m,nT stimato in dB. Linea: limite di legge per le abitazioni.</p>` +
      barChart({ items, min: 10, max: 60, step: 10, lines: [{ v: 40, label: "legge 40 dB" }], title: "Isolamento di facciata" }) + `</figure>`;
  }
  const imp = measurements.filter((m) => m.type === "impianti").sort((a, b) => a.date - b.date);
  if (imp.length) {
    const items = imp.map((m) => ({ label: m.plant || m.room, value: m.value, tone: m.pass ? "good" : "bad" }));
    h += `<figure class="panel fig"><h2>Rumore degli impianti</h2><p class="small muted">LASmax (discontinui) o LAeq (continui) in dB(A). Linee: limiti di legge 35 e 25 dB(A).</p>` +
      barChart({ items, min: 10, max: 60, step: 10, lines: [{ v: 25, label: "continui 25" }, { v: 35, label: "discontinui 35" }], title: "Rumore degli impianti" }) + `</figure>`;
  }
  box.innerHTML = h;
}

function describeMeasurement(m) {
  const when = new Date(m.date);
  const date = when.toLocaleDateString("it-IT", { day: "numeric", month: "short" }) + ", " + when.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const chip = (pass) => pass == null ? "" : `<span class="chip-s ${pass ? "ok" : "bad"}">${pass ? "entro il limite" : "oltre il limite"}</span>`;
  switch (m.type) {
    case "rt60": return { main: `RT60 ${fmt(m.rt60, 2)} s`, det: `${date} · media di ${m.trials || 1} prove` };
    case "insulation": return { main: `Isolamento da ${esc(m.from)}: DnT ${fmt(m.value)} dB ${m.wall === "units" ? chip(m.pass) : ""}`, det: `${date} · L1 ${fmt(m.l1)} · L2 ${fmt(m.l2)} · T ${fmt(m.t, 2)} s${m.limit ? " · valore limite" : ""}` };
    case "facade": return { main: `Facciata: D2m,nT ${fmt(m.value)} dB ${chip(m.pass)}`, det: `${date} · L1 ${fmt(m.l1)} · L2 ${fmt(m.l2)}` };
    case "impianti": return { main: `${esc(m.plant)}: ${m.kind === "disc" ? "LASmax" : "LAeq"} ${fmt(m.value)} dB(A) ${chip(m.pass)}`, det: date };
    case "differenziale": return { main: `${esc(m.source)}: differenza ${fmt(m.value)} dB(A) ${chip(m.pass)}`, det: `${date} · ${m.period === "day" ? "giorno" : "notte"}, finestre ${m.windows === "open" ? "aperte" : "chiuse"} · LA ${fmt(m.la)} · LR ${fmt(m.lr)}` };
    default: return { main: `Leq ${fmt(m.leq)} ${m.weighting === "Z" ? "dB(Z)" : "dB(A)"}`, det: `${date} · min ${fmt(m.min)} · max ${fmt(m.max)} · ${fmtDur(m.duration || 0)}`, color: m.leq };
  }
}

function renderRooms() {
  const list = $("rooms-list");
  $("btn-export").hidden = measurements.length === 0;
  if (!measurements.length) {
    $("results-charts").innerHTML = "";
    list.innerHTML = '<div class="panel empty"><h2>Nessun risultato salvato</h2><p class="muted small" style="margin-top:6px">Esegui una prova dalla scheda Prove o salva una misura dal fonometro: qui vedrai le stanze a confronto, con le soglie di riferimento nei grafici.</p></div>';
    $("delete-all-area").innerHTML = "";
    return;
  }
  renderResultCharts();
  let h = `<div style="display:flex;flex-direction:column;gap:12px">`;
  for (const room of roomNames()) {
    const items = measurements.filter((m) => m.room === room).sort((a, b) => b.date - a.date);
    h += `<div class="panel room"><h2>${esc(room)}</h2>`;
    for (const m of items) {
      const d = describeMeasurement(m);
      const style = d.color != null ? ` style="color:${cssVar(levelTone(d.color))}"` : "";
      h += `<div class="m-item"><div class="meta"><span class="tag">${TYPE_LABEL[m.type] || "Misura"}</span><div><strong${style}>${d.main}</strong></div><div class="small muted">${d.det}</div></div>` +
        `<button class="del" data-id="${esc(m.id)}" aria-label="Elimina risultato">×</button></div>`;
    }
    h += `</div>`;
  }
  list.innerHTML = h + `</div>`;
  list.querySelectorAll("[data-id]").forEach((b) => b.addEventListener("click", () => {
    measurements = measurements.filter((x) => x.id !== b.dataset.id); saveMeasurements(); renderRooms();
  }));

  const area = $("delete-all-area"); area.innerHTML = "";
  if (!confirmDeleteAll) {
    const b = document.createElement("button"); b.className = "link danger"; b.textContent = "Elimina tutti i risultati";
    b.addEventListener("click", () => { confirmDeleteAll = true; renderRooms(); });
    area.appendChild(b);
  } else {
    area.innerHTML = `<div class="notice error"><p style="margin-bottom:10px">Eliminare tutti i risultati salvati? L'operazione non si può annullare.</p><div class="save-row"><button class="stop" id="del-yes">Elimina tutto</button><button id="del-no">Annulla</button></div></div>`;
    $("del-yes").addEventListener("click", () => { measurements = []; saveMeasurements(); confirmDeleteAll = false; renderRooms(); });
    $("del-no").addEventListener("click", () => { confirmDeleteAll = false; renderRooms(); });
  }
}

function csv() {
  const f = (v, d = 1) => v == null || !isFinite(v) ? "" : v.toFixed(d).replace(".", ",");
  const lines = ["tipo;stanza;data;valore;leq_db;max_db;rt60_s;l1_db;l2_db;fondo_db;t_s;dettagli"];
  for (const m of [...measurements].sort((a, b) => a.date - b.date)) {
    const det = m.type === "insulation" ? `da ${m.from}; ${m.wall === "units" ? "tra appartamenti" : "interna"}`
      : m.type === "impianti" ? `${m.plant}; ${m.kind === "disc" ? "discontinuo LASmax" : "continuo LAeq"}`
      : m.type === "differenziale" ? `${m.source}; ${m.period}; finestre ${m.windows}; LA ${f(m.la)}; LR ${f(m.lr)}` : "";
    const value = m.value ?? m.leq ?? m.rt60;
    lines.push([TYPE_LABEL[m.type] || m.type, m.room, new Date(m.date).toISOString(), f(value, m.type === "rt60" ? 2 : 1), f(m.leq), f(m.max), f(m.rt60, 2), f(m.l1), f(m.l2), f(m.b), f(m.t, 2), det]
      .map((x) => String(x ?? "").replace(/;/g, ",")).join(";"));
  }
  return lines.join("\n");
}

// ---------- Impostazioni ----------
function renderSettings() {
  $("w-A").setAttribute("aria-pressed", String(settings.weighting === "A"));
  $("w-Z").setAttribute("aria-pressed", String(settings.weighting === "Z"));
  $("tw-fast").setAttribute("aria-pressed", String(settings.time === "fast"));
  $("tw-slow").setAttribute("aria-pressed", String(settings.time === "slow"));
  $("cal-value").textContent = fmt(settings.offset) + " dB";
  renderMeter();
}
const setSetting = (k, v, reset) => { settings[k] = v; saveSettings(); if (reset) resetStats(); renderSettings(); };

// ---------- Navigazione ----------
const VIEWS = ["meter", "tests", "emit", "rooms", "settings"];
function showView(name) {
  if (!VIEWS.includes(name)) name = "meter";
  currentView = name;
  for (const v of VIEWS) $("view-" + v).hidden = v !== name;
  document.querySelectorAll("nav.tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === name)));
  if (name === "meter") renderMeter();
  if (name === "tests") renderTests();
  if (name === "emit") renderEmitter();
  if (name === "rooms") renderRooms();
  if (location.hash.slice(1) !== name) history.replaceState(null, "", "#" + name);
  window.scrollTo(0, 0);
}

function init() {
  initGauge();
  renderRefSelect();
  document.querySelectorAll("nav.tabs button").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));

  $("btn-start").addEventListener("click", () => meter.running ? stopMeter() : startMeter());
  $("btn-reset").addEventListener("click", resetStats);
  $("ref-select").addEventListener("change", (e) => { settings.reference = e.target.value; saveSettings(); renderMeter(); });
  $("btn-save").addEventListener("click", () => {
    $("save-summary").textContent = `Leq ${fmt(cal(leqFS()))} ${unit()} su ${fmtDur(meter.elapsed)}`;
    renderChips("room-chips-meter", "room-name-meter");
    $("save-panel").hidden = false;
    $("room-name-meter").focus();
  });
  $("btn-save-cancel").addEventListener("click", () => { $("save-panel").hidden = true; });
  $("btn-save-confirm").addEventListener("click", () => {
    const name = $("room-name-meter").value.trim() || "Senza nome";
    addMeasurement({ type: "leq", room: name, weighting: settings.weighting, leq: cal(leqFS()), min: cal(meter.minFS), max: cal(meter.maxFS), peak: cal(meter.peakFS), duration: meter.elapsed });
    $("save-panel").hidden = true;
    const n = $("meter-notice");
    n.textContent = `Misura salvata in «${name}». La trovi nella scheda Risultati.`; n.className = "notice ok"; n.hidden = false;
    setTimeout(() => { if (n.classList.contains("ok")) n.hidden = true; }, 3500);
  });

  $("btn-export").addEventListener("click", async () => {
    const text = csv();
    const n = $("export-notice");
    try {
      const file = new File([text], "misure-acustiche.csv", { type: "text/csv" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "Misure acustiche" }); return; }
      if (navigator.share) { await navigator.share({ title: "Misure acustiche", text }); return; }
      await navigator.clipboard.writeText(text);
      n.textContent = "CSV copiato negli appunti."; n.className = "notice"; n.hidden = false;
    } catch (e) {
      if (e && e.name === "AbortError") return;
      n.textContent = "Condivisione non riuscita. Ecco i dati da copiare:\n" + text; n.className = "notice"; n.style.whiteSpace = "pre-wrap"; n.hidden = false;
    }
  });

  $("w-A").addEventListener("click", () => setSetting("weighting", "A", true));
  $("w-Z").addEventListener("click", () => setSetting("weighting", "Z", true));
  $("tw-fast").addEventListener("click", () => setSetting("time", "fast"));
  $("tw-slow").addEventListener("click", () => setSetting("time", "slow"));
  $("cal-minus").addEventListener("click", () => setSetting("offset", Math.round((settings.offset - 0.5) * 2) / 2));
  $("cal-plus").addEventListener("click", () => setSetting("offset", Math.round((settings.offset + 0.5) * 2) / 2));
  $("cal-reset").addEventListener("click", () => setSetting("offset", DEFAULT_OFFSET));

  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible") return;
    if (meter.running) {
      if (meter.ctx && meter.ctx.state !== "running") { try { await meter.ctx.resume(); } catch {} }
      try { meter.wakeLock = await navigator.wakeLock?.request("screen"); } catch {}
    }
    if (emitter.playing) { try { emitter.wakeLock = await navigator.wakeLock?.request("screen"); } catch {} }
  });
  window.addEventListener("resize", () => { if (currentView === "meter") renderMeter(); if (currentView === "tests") renderTests(); });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => showView(currentView));
  window.addEventListener("hashchange", () => showView(location.hash.slice(1)));

  initEmitter();
  renderSettings();
  renderControls();
  showView(location.hash.slice(1) || "meter");
}

init();
