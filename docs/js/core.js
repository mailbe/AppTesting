"use strict";

// ---------- Utilità ----------
const $ = (id) => document.getElementById(id);
const fmt = (v, d = 1) => (v == null || !isFinite(v)) ? "–" : v.toFixed(d).replace(".", ",");
const fmtDur = (s) => { const t = Math.max(0, Math.floor(s)); return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); };
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dbSum = (a, b) => 10 * Math.log10(Math.pow(10, a / 10) + Math.pow(10, b / 10));
const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
};

const DEFAULT_OFFSET = 110;
const settings = Object.assign({ weighting: "A", time: "fast", offset: DEFAULT_OFFSET, reference: "night" }, store.get("fonometro.settings", {}));
const saveSettings = () => store.set("fonometro.settings", settings);

let measurements = store.get("fonometro.measurements", []).map((m) => {
  if (!m.type) m.type = m.rt60 != null ? "rt60" : "leq";
  return m;
});
const saveMeasurements = () => store.set("fonometro.measurements", measurements);
function addMeasurement(m) {
  measurements.push(Object.assign({ id: Date.now() + "-" + Math.random().toString(36).slice(2, 7), date: Date.now() }, m));
  saveMeasurements();
}

// Piccolo sistema di notifiche tra moduli
const hooks = { level: [], state: [], beforeMic: [] };
const notify = (name, ...args) => hooks[name].forEach((f) => { try { f(...args); } catch (e) { console.error(e); } });

// ---------- Filtro di ponderazione A (IEC 61672) ----------
// Tre biquad ottenuti con trasformazione bilineare, normalizzati a 0 dB a 1 kHz.
function aWeightingSections(fs) {
  const k = 2 * fs, w = (f) => 2 * Math.PI * f;
  const w1 = w(20.598997), w2 = w(107.65265), w3 = w(737.86223), w4 = w(12194.217);
  const bil = ([b2, b1, b0], [a2, a1, a0]) => {
    const A0 = a2 * k * k + a1 * k + a0;
    return {
      b: [(b2 * k * k + b1 * k + b0) / A0, (2 * b0 - 2 * b2 * k * k) / A0, (b2 * k * k - b1 * k + b0) / A0],
      a: [1, (2 * a0 - 2 * a2 * k * k) / A0, (a2 * k * k - a1 * k + a0) / A0]
    };
  };
  const secs = [
    bil([1, 0, 0], [1, 2 * w1, w1 * w1]),
    bil([1, 0, 0], [1, w2 + w3, w2 * w3]),
    bil([0, 0, 1], [1, 2 * w4, w4 * w4])
  ];
  const om = 2 * Math.PI * 1000 / fs;
  let mag = 1;
  for (const { b, a } of secs) {
    const re = (c) => c[0] + c[1] * Math.cos(om) + c[2] * Math.cos(2 * om);
    const im = (c) => -c[1] * Math.sin(om) - c[2] * Math.sin(2 * om);
    mag *= Math.hypot(re(b), im(b)) / Math.hypot(re(a), im(a));
  }
  secs[0].b = secs[0].b.map((x) => x / mag);
  return secs;
}

// ---------- Elaborazione a blocchi da 10 ms ----------
// Canale 0: segnale lineare, canale 1: segnale ponderato A.
const WORKLET_SRC = `
class LevelProc extends AudioWorkletProcessor {
  constructor() { super(); this.n = Math.round(sampleRate * 0.01); this.c = 0; this.r = 0; this.a = 0; this.p = 0; }
  process(inputs) {
    const inp = inputs[0];
    if (!inp || !inp.length) return true;
    const raw = inp[0], wtd = inp[1] || inp[0];
    for (let i = 0; i < raw.length; i++) {
      const x = raw[i], y = wtd[i];
      this.r += x * x; this.a += y * y;
      const ax = x < 0 ? -x : x; if (ax > this.p) this.p = ax;
      if (++this.c >= this.n) {
        this.port.postMessage([this.r / this.n, this.a / this.n, this.p, this.n / sampleRate]);
        this.c = 0; this.r = 0; this.a = 0; this.p = 0;
      }
    }
    return true;
  }
}
registerProcessor("level-proc", LevelProc);
`;

const meter = {
  ctx: null, stream: null, nodes: [], running: false, starting: false, wakeLock: null, error: "",
  smoothed: 0, levelFS: null, minFS: null, maxFS: null, peakFS: null,
  energySum: 0, energyTime: 0, elapsed: 0, history: [], histAcc: 0, histN: 0
};

function resetStats() {
  Object.assign(meter, { smoothed: 0, levelFS: null, minFS: null, maxFS: null, peakFS: null, energySum: 0, energyTime: 0, elapsed: 0, history: [], histAcc: 0, histN: 0 });
  notify("level");
}

const cal = (fs) => fs == null ? null : fs + settings.offset;
const leqFS = () => meter.energyTime > 0 ? 10 * Math.log10(Math.max(meter.energySum / meter.energyTime, 1e-12)) : null;
const toDB = (ms) => 10 * Math.log10(Math.max(ms, 1e-12));

function onBlock(rawMS, aMS, peak, dur) {
  if (!meter.running) return;
  const ms = settings.weighting === "A" ? aMS : rawMS;
  const tau = settings.time === "fast" ? 0.125 : 1.0;
  const c = Math.exp(-dur / tau);
  meter.smoothed = c * meter.smoothed + (1 - c) * ms;
  meter.energySum += ms * dur;
  meter.energyTime += dur;
  meter.elapsed += dur;
  const lv = toDB(meter.smoothed);
  meter.levelFS = lv;
  if (meter.elapsed > 0.5) {
    meter.minFS = meter.minFS == null ? lv : Math.min(meter.minFS, lv);
    meter.maxFS = meter.maxFS == null ? lv : Math.max(meter.maxFS, lv);
  }
  const pk = 20 * Math.log10(Math.max(peak, 1e-9));
  meter.peakFS = meter.peakFS == null ? pk : Math.max(meter.peakFS, pk);

  meter.histAcc += lv; meter.histN++;
  if (meter.histN >= 10) {
    meter.history.push([meter.elapsed, meter.histAcc / meter.histN]);
    meter.histAcc = 0; meter.histN = 0;
    const cut = meter.elapsed - 60;
    while (meter.history.length && meter.history[0][0] < cut) meter.history.shift();
  }

  capture.feed(rawMS, aMS, dur);
  reverb.ingest(toDB(rawMS));
  notify("level");
}

async function startMeter() {
  if (meter.running || meter.starting) return meter.running;
  meter.error = "";
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    meter.error = "Questo browser non permette l'accesso al microfono. Apri la pagina in Safari tramite un indirizzo https.";
    notify("state");
    return false;
  }
  notify("beforeMic");
  meter.starting = true;
  notify("state");
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    meter.ctx = ctx;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }
    });
    meter.stream = stream;
    if (ctx.state === "suspended") await ctx.resume();

    const src = ctx.createMediaStreamSource(stream);
    const merger = ctx.createChannelMerger(2);
    src.connect(merger, 0, 0);
    let last = src;
    const filters = aWeightingSections(ctx.sampleRate).map(({ b, a }) => ctx.createIIRFilter(b, a));
    for (const f of filters) { last.connect(f); last = f; }
    last.connect(merger, 0, 1);

    const mute = ctx.createGain();
    mute.gain.value = 0;
    mute.connect(ctx.destination);
    let proc;
    if (ctx.audioWorklet && window.AudioWorkletNode) {
      const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: "application/javascript" }));
      await ctx.audioWorklet.addModule(url);
      proc = new AudioWorkletNode(ctx, "level-proc", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 2, channelCountMode: "explicit", channelInterpretation: "discrete" });
      proc.port.onmessage = (e) => onBlock(e.data[0], e.data[1], e.data[2], e.data[3]);
    } else {
      // Fallback per browser senza AudioWorklet
      proc = ctx.createScriptProcessor(4096, 2, 1);
      const n = Math.round(ctx.sampleRate * 0.01);
      let cnt = 0, r = 0, aa = 0, p = 0;
      proc.onaudioprocess = (e) => {
        const raw = e.inputBuffer.getChannelData(0), wtd = e.inputBuffer.getChannelData(1);
        for (let i = 0; i < raw.length; i++) {
          const x = raw[i], y = wtd[i];
          r += x * x; aa += y * y; const ax = Math.abs(x); if (ax > p) p = ax;
          if (++cnt >= n) { onBlock(r / n, aa / n, p, n / ctx.sampleRate); cnt = 0; r = 0; aa = 0; p = 0; }
        }
      };
    }
    merger.connect(proc);
    proc.connect(mute);
    meter.nodes = [src, merger, ...filters, proc, mute];

    stream.getAudioTracks().forEach((t) => t.addEventListener("ended", stopMeter));
    resetStats();
    meter.running = true;
    try { meter.wakeLock = await navigator.wakeLock?.request("screen"); } catch {}
  } catch (err) {
    cleanupAudio();
    if (err && (err.name === "NotAllowedError" || err.name === "SecurityError")) {
      meter.error = "Accesso al microfono negato. Su iPhone: Impostazioni › Safari › Microfono › Consenti, poi ricarica la pagina.";
    } else {
      meter.error = "Impossibile avviare il microfono: " + (err && err.message ? err.message : err);
    }
  }
  meter.starting = false;
  notify("state");
  return meter.running;
}

function cleanupAudio() {
  for (const n of meter.nodes) { try { n.disconnect(); } catch {} }
  meter.nodes = [];
  if (meter.stream) meter.stream.getTracks().forEach((t) => t.stop());
  meter.stream = null;
  if (meter.ctx) { try { meter.ctx.close(); } catch {} }
  meter.ctx = null;
  if (meter.wakeLock) { meter.wakeLock.release().catch(() => {}); meter.wakeLock = null; }
}

function stopMeter() {
  if (!meter.running) return;
  meter.running = false;
  cleanupAudio();
  capture.cancel();
  if (reverb.isActive()) reverb.cancel();
  notify("state");
  notify("level");
}

// ---------- Registrazione di una misura (usata dalle prove guidate) ----------
// Registra sempre LAeq, LZeq, LAFmax, LASmax e LAFmin, indipendentemente dalle impostazioni del fonometro.
const capture = {
  active: null,
  start(opts) {
    this.active = Object.assign({ t: 0, eA: 0, eZ: 0, fast: null, slow: null, maxF: -Infinity, maxS: -Infinity, minF: Infinity }, opts);
  },
  feed(rawMS, aMS, dur) {
    const c = this.active;
    if (!c) return;
    c.t += dur;
    c.eA += aMS * dur;
    c.eZ += rawMS * dur;
    const kf = Math.exp(-dur / 0.125), ks = Math.exp(-dur / 1.0);
    c.fast = c.fast == null ? aMS : kf * c.fast + (1 - kf) * aMS;
    c.slow = c.slow == null ? aMS : ks * c.slow + (1 - ks) * aMS;
    c.maxF = Math.max(c.maxF, toDB(c.fast));
    c.maxS = Math.max(c.maxS, toDB(c.slow));
    if (c.t > 0.3) c.minF = Math.min(c.minF, toDB(c.fast));
    if (c.duration && c.t >= c.duration) this.finish();
  },
  partial() {
    const c = this.active;
    if (!c || c.t <= 0) return null;
    return { t: c.t, leqA: toDB(c.eA / c.t) + settings.offset, duration: c.duration };
  },
  finish() {
    const c = this.active;
    if (!c) return;
    this.active = null;
    if (c.t <= 0) return;
    const off = settings.offset;
    c.onDone({
      leqA: toDB(c.eA / c.t) + off,
      leqZ: toDB(c.eZ / c.t) + off,
      lafmax: c.maxF + off,
      lasmax: c.maxS + off,
      lafmin: isFinite(c.minF) ? c.minF + off : null,
      duration: c.t
    });
  },
  cancel() { this.active = null; }
};

// ---------- Riverbero (RT60) con battito di mani ----------
const reverb = {
  state: "idle", message: "", rt: null, method: "",
  background: [], recording: [], noise: -120, results: [], decay: [], schroeder: [],
  listeners: [],
  changed() { this.listeners.forEach((f) => f()); },
  isActive() { return ["calibrating", "armed", "recording"].includes(this.state); },
  arm() { this.background = []; this.recording = []; this.state = "calibrating"; this.changed(); },
  cancel() { this.state = "idle"; this.changed(); },
  clear() { Object.assign(this, { results: [], decay: [], schroeder: [], method: "", rt: null, state: "idle" }); this.changed(); },
  removeTrial(i) { this.results.splice(i, 1); this.changed(); },
  average() { return this.results.length ? this.results.reduce((a, b) => a + b, 0) / this.results.length : null; },
  ingest(level) {
    if (this.state === "calibrating") {
      this.background.push(level);
      if (this.background.length >= 100) {
        const s = [...this.background].sort((a, b) => a - b);
        this.noise = s[Math.floor(s.length / 2)];
        this.state = "armed"; this.changed();
      }
    } else if (this.state === "armed") {
      if (level > this.noise + 20) {
        this.recording = this.background.slice(-5).concat([level]);
        this.state = "recording"; this.changed();
      } else {
        this.background.push(level);
        if (this.background.length > 100) this.background.shift();
      }
    } else if (this.state === "recording") {
      this.recording.push(level);
      if (this.recording.length >= 300) this.analyze();
    }
  },
  fail(msg) { this.state = "failed"; this.message = msg; this.changed(); },
  analyze() {
    const L = this.recording, bd = 0.01;
    let pi = 0;
    for (let i = 1; i < L.length; i++) if (L[i] > L[pi]) pi = i;
    const peak = L[pi], noise = this.noise, range = peak - noise;
    if (range < 25) return this.fail(`Impulso troppo debole rispetto al rumore di fondo (${Math.round(range)} dB). Batti le mani più forte o riduci i rumori nella stanza.`);

    this.decay = L.map((v, i) => [(i - pi) * bd, v - peak]).filter((_, i) => i >= pi - 5);
    const tail = L.slice(pi);
    let end = tail.findIndex((v) => v <= noise + 3); if (end < 0) end = tail.length;
    const ne = Math.pow(10, noise / 10);
    const en = tail.slice(0, end).map((v) => Math.max(Math.pow(10, v / 10) - ne, 0));
    if (en.length < 5) return this.fail("Decadimento troppo breve per essere misurato. Riprova.");

    const edc = new Array(en.length); let acc = 0;
    for (let i = en.length - 1; i >= 0; i--) { acc += en[i]; edc[i] = acc; }
    if (!(edc[0] > 0)) return this.fail("Segnale non valido. Riprova.");
    const edcDB = edc.map((v) => 10 * Math.log10(Math.max(v / edc[0], 1e-12)));
    this.schroeder = edcDB.map((v, i) => [i * bd, v]);

    const lower = range >= 35 ? -25 : -15;
    this.method = range >= 35 ? "Metodo T20" : "Metodo T10";
    const pts = [];
    edcDB.forEach((v, i) => { if (v <= -5 && v >= lower) pts.push([i * bd, v]); });
    if (pts.length < 3) return this.fail("Decadimento troppo rapido o irregolare. Riprova in un punto diverso della stanza.");
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    let num = 0, den = 0;
    for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
    const slope = den > 0 ? num / den : 0;
    if (!(slope < 0)) return this.fail("Impossibile stimare il decadimento. Riprova.");
    const rt = -60 / slope;
    if (rt < 0.05 || rt > 5) return this.fail(`Valore fuori scala (${fmt(rt, 2)} s). Riprova.`);
    this.rt = rt; this.results.push(rt); this.state = "done";
    this.changed();
  }
};
