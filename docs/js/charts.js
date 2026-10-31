"use strict";

// ---------- Grafici su canvas (tempo reale) ----------
function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  const g = canvas.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return { g, w, h };
}

function drawAxes(g, w, h, pad, yTicks, yMin, yMax, xLabel) {
  g.font = "11px " + cssVar("--font-display");
  g.fillStyle = cssVar("--muted");
  g.strokeStyle = cssVar("--line");
  g.lineWidth = 1;
  g.setLineDash([]);
  g.textAlign = "right"; g.textBaseline = "middle";
  for (const t of yTicks) {
    const y = pad.t + (1 - (t - yMin) / (yMax - yMin)) * (h - pad.t - pad.b);
    g.beginPath(); g.moveTo(pad.l, y); g.lineTo(w - pad.r, y); g.stroke();
    g.fillText(String(t), pad.l - 6, y);
  }
  if (xLabel) { g.textAlign = "right"; g.textBaseline = "bottom"; g.fillText(xLabel, w - pad.r, h); }
}

// Linea di soglia tratteggiata con etichetta
function drawThreshold(g, w, y, pad, label, color) {
  g.save();
  g.strokeStyle = color; g.lineWidth = 1.5; g.setLineDash([5, 4]);
  g.beginPath(); g.moveTo(pad.l, y); g.lineTo(w - pad.r, y); g.stroke();
  g.setLineDash([]);
  g.font = "600 11px " + cssVar("--font-body");
  const tw = g.measureText(label).width;
  g.fillStyle = cssVar("--surface");
  g.fillRect(w - pad.r - tw - 8, y - 16, tw + 8, 14);
  g.fillStyle = color; g.textAlign = "right"; g.textBaseline = "bottom";
  g.fillText(label, w - pad.r - 4, y - 3);
  g.restore();
}

function drawHistory(canvas, history, elapsed, reference) {
  if (!canvas.clientWidth) return;
  const { g, w, h } = setupCanvas(canvas);
  const pad = { l: 34, r: 6, t: 8, b: 16 };
  const yMin = 20, yMax = 120;
  drawAxes(g, w, h, pad, [20, 40, 60, 80, 100, 120], yMin, yMax, "secondi");
  const Y = (v) => pad.t + (1 - (Math.min(Math.max(v, yMin), yMax) - yMin) / (yMax - yMin)) * (h - pad.t - pad.b);
  const t1 = Math.max(elapsed, 10), t0 = Math.max(0, t1 - 60);
  const X = (t) => pad.l + (t - t0) / (t1 - t0) * (w - pad.l - pad.r);
  const accent = cssVar("--accent");
  if (history.length >= 2) {
    g.beginPath();
    history.forEach(([t, v], i) => { const x = X(t), y = Y(v + settings.offset); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.lineTo(X(history[history.length - 1][0]), h - pad.b); g.lineTo(X(history[0][0]), h - pad.b); g.closePath();
    g.globalAlpha = 0.14; g.fillStyle = accent; g.fill(); g.globalAlpha = 1;
    g.beginPath();
    history.forEach(([t, v], i) => { const x = X(t), y = Y(v + settings.offset); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.strokeStyle = accent; g.lineWidth = 2; g.lineJoin = "round"; g.stroke();
    const [lt, lv] = history[history.length - 1];
    g.beginPath(); g.arc(X(lt), Y(lv + settings.offset), 3.5, 0, Math.PI * 2); g.fillStyle = accent; g.fill();
  }
  if (reference && reference.v != null) drawThreshold(g, w, Y(reference.v), pad, reference.short, cssVar("--danger"));
}

function drawDecay(canvas) {
  if (!canvas || !canvas.clientWidth) return;
  const { g, w, h } = setupCanvas(canvas);
  const pad = { l: 34, r: 6, t: 8, b: 16 };
  const yMin = -70, yMax = 5;
  drawAxes(g, w, h, pad, [0, -20, -40, -60], yMin, yMax, "secondi");
  const all = reverb.decay.concat(reverb.schroeder);
  if (!all.length) return;
  const t0 = Math.min(...reverb.decay.map((p) => p[0])), t1 = Math.max(...all.map((p) => p[0]), 0.5);
  const X = (t) => pad.l + (t - t0) / (t1 - t0) * (w - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (Math.min(Math.max(v, yMin), yMax) - yMin) / (yMax - yMin)) * (h - pad.t - pad.b);
  const line = (pts, color, width) => {
    g.beginPath(); pts.forEach(([t, v], i) => i ? g.lineTo(X(t), Y(v)) : g.moveTo(X(t), Y(v)));
    g.strokeStyle = color; g.lineWidth = width; g.lineJoin = "round"; g.stroke();
  };
  line(reverb.decay, cssVar("--muted"), 1.2);
  line(reverb.schroeder, cssVar("--accent"), 2.4);
  drawThreshold(g, w, Y(-60), pad, "−60 dB", cssVar("--muted"));
}

// ---------- Grafici SVG (risultati e soglie) ----------
let svgUid = 0;

// Scala orizzontale con bande (classi), linea di soglia di legge e valore misurato
function scaleChart(o) {
  const W = 340, H = 96, L = 10, R = 330, ty = 42, th = 14;
  const X = (v) => L + (Math.min(Math.max(v, o.min), o.max) - o.min) / (o.max - o.min) * (R - L);
  let s = `<svg class="sc" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || "Grafico con soglie")}">`;
  s += `<rect x="${L}" y="${ty}" width="${R - L}" height="${th}" rx="3" class="sc-track"/>`;
  for (const b of o.bands || []) {
    const x0 = X(b.from), x1 = X(b.to);
    if (x1 - x0 < 0.5) continue;
    s += `<rect x="${x0.toFixed(1)}" y="${ty}" width="${(x1 - x0).toFixed(1)}" height="${th}" class="t-${b.tone}"/>`;
    if (b.label && x1 - x0 > 16) s += `<text x="${((x0 + x1) / 2).toFixed(1)}" y="${ty + 10.5}" class="sc-band">${esc(b.label)}</text>`;
  }
  const step = o.step || 10;
  for (let v = Math.ceil(o.min / step) * step; v <= o.max + 1e-9; v += step) {
    const x = X(v);
    s += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${ty + th}" y2="${ty + th + 4}" class="sc-tick"/>`;
    s += `<text x="${x.toFixed(1)}" y="${ty + th + 15}" class="sc-num">${fmt(v, o.decimals || 0)}</text>`;
  }
  for (const ln of o.lines || []) {
    const x = X(ln.v);
    const anchor = x > R - 60 ? "end" : x < L + 60 ? "start" : "middle";
    s += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${ty - 14}" y2="${ty + th + 2}" class="sc-limit"/>`;
    s += `<text x="${x.toFixed(1)}" y="${ty - 18}" text-anchor="${anchor}" class="sc-limit-t">${esc(ln.label)}</text>`;
  }
  if (o.value != null && isFinite(o.value)) {
    const x = X(o.value);
    const anchor = x > R - 50 ? "end" : x < L + 50 ? "start" : "middle";
    s += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${ty - 2}" y2="${ty + th + 2}" class="sc-mark-l"/>`;
    s += `<path d="M${x.toFixed(1)} ${ty + th + 18} l-5 8 h10 z" class="sc-mark"/>`;
    s += `<text x="${x.toFixed(1)}" y="${H - 2}" text-anchor="${anchor}" class="sc-val">${esc(o.valueText)}</text>`;
  }
  return s + "</svg>";
}

// Barre orizzontali per stanza con soglie e fascia consigliata
function barChart(o) {
  const W = 340, LW = 96, R = 300, rowH = 28;
  const nLab = (o.lines || []).length + (o.band ? 1 : 0);
  const top = 12 + nLab * 12;
  const H = top + o.items.length * rowH + 22;
  const X = (v) => LW + (Math.min(Math.max(v, o.min), o.max) - o.min) / (o.max - o.min) * (R - LW);
  let s = `<svg class="bc" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || "Grafico a barre")}">`;
  if (o.band) {
    const x0 = X(o.band.from), x1 = X(o.band.to);
    s += `<rect x="${x0.toFixed(1)}" y="${top - 6}" width="${(x1 - x0).toFixed(1)}" height="${o.items.length * rowH + 6}" class="bc-band"/>`;
    s += `<text x="${((x0 + x1) / 2).toFixed(1)}" y="${10 + (o.lines || []).length * 12}" class="bc-band-t">${esc(o.band.label)}</text>`;
  }
  const step = o.step || 10;
  for (let v = Math.ceil(o.min / step) * step; v <= o.max + 1e-9; v += step) {
    const x = X(v);
    s += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${top - 4}" y2="${H - 18}" class="bc-grid"/>`;
    s += `<text x="${x.toFixed(1)}" y="${H - 5}" class="bc-num">${fmt(v, o.decimals || 0)}</text>`;
  }
  o.items.forEach((it, i) => {
    const y = top + i * rowH;
    const label = it.label.length > 14 ? it.label.slice(0, 13) + "…" : it.label;
    s += `<text x="${LW - 8}" y="${y + 15}" class="bc-label">${esc(label)}</text>`;
    const x1 = X(it.value);
    s += `<rect x="${LW}" y="${y + 4}" width="${Math.max(x1 - LW, 2).toFixed(1)}" height="16" rx="3" class="t-${it.tone || "accent"}"/>`;
    s += `<text x="${(x1 + 5).toFixed(1)}" y="${y + 16}" class="bc-val">${fmt(it.value, o.decimals || 0)}</text>`;
  });
  (o.lines || []).forEach((ln, i) => {
    const x = X(ln.v);
    s += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${top - 4}" y2="${H - 18}" class="sc-limit"/>`;
    s += `<text x="${x.toFixed(1)}" y="${10 + i * 12}" text-anchor="${x > R - 40 ? "end" : x < LW + 40 ? "start" : "middle"}" class="sc-limit-t">${esc(ln.label)}</text>`;
  });
  return s + "</svg>";
}

// ---------- Schemi di posizionamento ----------
const f1 = (n) => n.toFixed(1);
function dgOpen(w, h, title) {
  const id = "dg" + (++svgUid);
  const head = `<svg class="dg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}"><defs>` +
    `<marker id="${id}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9z" class="dg-arrowhead"/></marker>` +
    `<pattern id="${id}h" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" class="dg-hatch"/></pattern></defs>`;
  return { id, head };
}
function dim(id, x1, y1, x2, y2, label, lx, ly, anchor = "middle") {
  return `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" class="dg-dim" marker-start="url(#${id})" marker-end="url(#${id})"/>` +
    `<text x="${f1(lx)}" y="${f1(ly)}" text-anchor="${anchor}" class="dg-dim-t">${esc(label)}</text>`;
}
function arcPath(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M${f1(x0)} ${f1(y0)} A${r} ${r} 0 0 1 ${f1(x1)} ${f1(y1)}`;
}
// Telefono che emette (A) con onde sonore nella direzione indicata (gradi)
function emitterIcon(x, y, on, dir, label = "A") {
  let s = `<g class="${on ? "dg-on" : "dg-off"}">`;
  [12, 19, 26].forEach((r) => { s += `<path d="${arcPath(x, y, r, dir - 32, dir + 32)}" class="dg-wave"/>`; });
  s += `<rect x="${x - 6}" y="${y - 10}" width="12" height="20" rx="3" class="dg-emit"/>`;
  s += `<circle cx="${x}" cy="${y + 5}" r="2.2" class="dg-emit-spk"/>`;
  s += `<text x="${x}" y="${y - 14}" class="dg-tag dg-tag-a">${esc(label)}</text></g>`;
  return s;
}
// Impianto (tubazione / macchina) come sorgente
function plantIcon(x, y, on) {
  let s = `<g class="${on ? "dg-on" : "dg-off"}">`;
  [14, 21].forEach((r) => { s += `<path d="${arcPath(x, y, r, -30, 30)}" class="dg-wave"/>`; });
  s += `<rect x="${x - 10}" y="${y - 10}" width="20" height="20" rx="4" class="dg-emit"/>`;
  s += `<path d="M${x - 5} ${y} h10 M${x} ${y - 5} v10" class="dg-emit-x"/>`;
  s += `<text x="${x}" y="${y - 14}" class="dg-tag dg-tag-a">impianto</text></g>`;
  return s;
}
// Persona vista dall'alto con il telefono che misura (B) e percorso di misura
function personIcon(x, y, path = true, label = "B") {
  let s = "";
  if (path) s += `<circle cx="${x}" cy="${y}" r="24" class="dg-path"/>`;
  s += `<ellipse cx="${x}" cy="${y + 3}" rx="11" ry="6" class="dg-person"/>`;
  s += `<circle cx="${x}" cy="${y + 2}" r="5" class="dg-person"/>`;
  s += `<rect x="${x - 3.5}" y="${y - 13}" width="7" height="10" rx="1.5" class="dg-meas"/>`;
  s += `<text x="${x}" y="${y - 17}" class="dg-tag dg-tag-b">${esc(label)}</text>`;
  return s;
}
function clapIcon(x, y) {
  return `<ellipse cx="${x}" cy="${y + 3}" rx="11" ry="6" class="dg-person"/><circle cx="${x}" cy="${y + 2}" r="5" class="dg-person"/>` +
    `<path d="M${x - 7} ${y - 12} l-4 -5 M${x} ${y - 14} v-6 M${x + 7} ${y - 12} l4 -5" class="dg-clap"/>` +
    `<text x="${x}" y="${y + 21}" class="dg-small">batte le mani</text>`;
}
function room(x, y, w, h, hl) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="dg-floor${hl ? " dg-hl" : ""}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" class="dg-wall"/>`;
}
function door(x, y, w, side = "bottom") {
  // Varco nel muro con anta chiusa disegnata come arco
  if (side === "bottom") return `<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y}" class="dg-gap"/><path d="M${x} ${y} L${x + w} ${y}" class="dg-door"/><path d="M${x} ${y} A${w} ${w} 0 0 0 ${x + w} ${y - w}" class="dg-door-arc"/><line x1="${x}" y1="${y}" x2="${x}" y2="${y - w}" class="dg-door"/>`;
  return "";
}
function win(x1, y1, x2, y2) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="dg-gap"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="dg-win"/>`;
}
function legend(y, items) {
  return `<text x="170" y="${y}" class="dg-legend">${items}</text>`;
}

// Due stanze adiacenti: sorgente (A) e ricevente
function planTwoRooms(o) {
  const { id, head } = dgOpen(340, 236, o.title || "Schema di posizionamento");
  let s = head;
  s += `<text x="87" y="16" class="dg-title">${esc(o.srcName || "Stanza sorgente")}</text>`;
  s += `<text x="253" y="16" class="dg-title">${esc(o.rcvName || "Stanza ricevente")}</text>`;
  s += room(12, 26, 151, 166, o.highlight === "src") + room(177, 26, 151, 166, o.highlight === "rcv");
  s += `<rect x="163" y="26" width="14" height="166" fill="url(#${id}h)" class="dg-sep"/>`;
  s += win(40, 26, 90, 26) + win(230, 26, 280, 26);
  s += door(118, 192, 26) + door(290, 192, 26);
  s += `<text x="170" y="206" class="dg-small">parete divisoria</text>`;
  if (o.plant) s += plantIcon(42, 62, o.emitter === "on");
  else if (o.emitter) s += emitterIcon(40, 62, o.emitter === "on", 225);
  if (o.emitter && o.dims !== false && !o.plant) {
    s += dim(id, 50, 80, 158, 80, "≥ 1,5 m dalla parete", 104, 75);
  }
  if (o.measurer === "src") {
    s += personIcon(108, 140, true);
    s += dim(id, 48, 74, 92, 124, "≥ 1 m", 60, 108, "end");
    s += dim(id, 108, 166, 108, 189, "≥ 0,5 m", 114, 182, "start");
  } else if (o.measurer === "rcv") {
    s += personIcon(256, 118, true);
    s += dim(id, 180, 118, 230, 118, "≥ 0,5 m", 205, 112);
  }
  s += legend(228, o.legend || "A = telefono che emette · B = telefono che misura");
  return s + "</svg>";
}

// Facciata: esterno (balcone) e stanza interna
function planFacade(o) {
  const { id, head } = dgOpen(340, 236, o.title || "Schema di posizionamento per la facciata");
  let s = head;
  s += `<text x="80" y="16" class="dg-title">Esterno / balcone</text>`;
  s += `<text x="248" y="16" class="dg-title">${esc(o.roomName || "Stanza interna")}</text>`;
  s += `<rect x="12" y="26" width="146" height="166" class="dg-outside${o.highlight === "out" ? " dg-hl" : ""}"/>`;
  s += room(170, 26, 158, 166, o.highlight === "in");
  s += `<rect x="158" y="26" width="12" height="166" fill="url(#${id}h)" class="dg-sep"/>`;
  s += win(164, 88, 164, 140);
  s += `<text x="150" y="84" style="text-anchor:end" class="dg-small">finestra chiusa</text>`;
  if (o.emitter) s += emitterIcon(44, 172, o.emitter === "on", -42);
  if (o.measurer === "out") {
    s += personIcon(104, 114, true);
    s += dim(id, 130, 128, 156, 128, "2 m", 143, 142);
    if (o.emitter) s += dim(id, 54, 160, 90, 130, "≥ 1 m", 60, 140, "end");
  } else if (o.measurer === "in") {
    s += personIcon(256, 116, true);
    s += dim(id, 173, 116, 230, 116, "≥ 0,5 m", 201, 110);
  }
  s += legend(228, o.legend || "A = telefono che emette · B = telefono che misura");
  return s + "</svg>";
}

// Stanza singola: rumore di fondo, riverbero, criterio differenziale
function planOneRoom(o) {
  const { id, head } = dgOpen(340, 236, o.title || "Schema di posizionamento");
  let s = head;
  const top = o.variant === "diff" ? 44 : 26;
  s += `<text x="170" y="${top - 10}" class="dg-title">${esc(o.roomName || "Stanza")}</text>`;
  s += room(50, top, 240, 192 - top, true);
  s += win(130, top, 210, top) + door(240, 192, 26);
  if (o.variant === "fondo") {
    s += personIcon(170, 112, true);
    s += dim(id, 53, 112, 144, 112, "≥ 1 m", 98, 106);
    s += dim(id, 170, 138, 170, 189, "≥ 1 m", 176, 170, "start");
    s += `<text x="170" y="${top + 14}" class="dg-small">finestre e porte chiuse</text>`;
  } else if (o.variant === "rt60") {
    s += `<rect x="118" y="100" width="7" height="11" rx="1.5" class="dg-meas"/><circle cx="121.5" cy="105.5" r="12" class="dg-stand"/>`;
    s += `<text x="121" y="88" class="dg-tag dg-tag-b">telefono</text>`;
    s += `<text x="121" y="128" class="dg-small">su un supporto a 1,2 m</text>`;
    s += clapIcon(232, 112);
    s += dim(id, 136, 106, 218, 110, "≥ 2 m", 177, 100);
    s += dim(id, 53, 106, 108, 106, "≥ 1 m", 80, 100);
  } else if (o.variant === "diff") {
    s += `<g class="dg-on"><path d="${arcPath(170, 18, 10, 40, 140)}" class="dg-wave"/><path d="${arcPath(170, 18, 16, 50, 130)}" class="dg-wave"/></g>`;
    s += `<text x="216" y="16" style="text-anchor:start" class="dg-small">sorgente esterna</text>`;
    s += `<text x="170" y="${top + 14}" class="dg-small">finestre ${o.windows === "open" ? "aperte" : "chiuse"}</text>`;
    s += personIcon(170, 116, true);
    s += dim(id, 170, top + 18, 170, 90, "≈ 1 m dalla finestra", 176, 76, "start");
  }
  s += legend(228, o.legend || "B = telefono che misura");
  return s + "</svg>";
}

// Vista laterale: come tenere il telefono
function elevationDiagram() {
  const { id, head } = dgOpen(340, 170, "Come tenere il telefono durante la misura");
  let s = head;
  s += `<line x1="20" y1="150" x2="320" y2="150" class="dg-ground"/>`;
  // persona di profilo
  s += `<circle cx="92" cy="40" r="10" class="dg-person"/>`;
  s += `<path d="M92 50 L92 104 M92 104 L80 150 M92 104 L104 150 M92 62 L150 74" class="dg-body"/>`;
  s += `<rect x="150" y="62" width="8" height="18" rx="2" class="dg-meas" transform="rotate(-10 154 71)"/>`;
  s += `<text x="168" y="50" style="text-anchor:start" class="dg-small">microfono libero,</text>`;
  s += `<text x="168" y="62" style="text-anchor:start" class="dg-small">schermo verso di te</text>`;
  s += dim(id, 240, 72, 240, 147, "1,2–1,5 m", 246, 114, "start");
  s += `<line x1="160" y1="72" x2="240" y2="72" class="dg-guide"/>`;
  s += dim(id, 96, 92, 150, 92, "braccio teso", 123, 104);
  s += `<text x="170" y="166" class="dg-legend">Lontano dal corpo e da pareti, senza coprire il microfono in basso</text>`;
  return s + "</svg>";
}
