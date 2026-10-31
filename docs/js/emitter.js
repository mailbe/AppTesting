"use strict";

// ---------- Emissione di suono controllato (telefono A) ----------
// Il segnale viene generato come file WAV in loop e riprodotto con un elemento <audio>:
// su iPhone così suona anche con l'interruttore silenzioso attivo e passa alle casse Bluetooth.
const SIGNALS = {
  pink: { label: "Rumore rosa", text: "Energia uguale per ottava, come prevedono le norme per le prove di isolamento. È il segnale consigliato." },
  white: { label: "Rumore bianco", text: "Più ricco di acuti, suona come un fruscio. Utile per sentire dove passano i suoni alti (spifferi, fessure, porte)." },
  tone: { label: "Tono puro", text: "Una sola frequenza. Utile per confrontare come le pareti isolano bassi e acuti: prova 125 Hz e poi 2000 Hz." }
};
const TONE_FREQS = [125, 250, 500, 1000, 2000, 4000];

const emitter = {
  opts: Object.assign({ signal: "pink", freq: 1000, level: 1, delay: 10, duration: 0, place: "rooms" }, store.get("fonometro.emitter", {})),
  audio: null, url: null, playing: false, phase: "off", delayEnd: 0, startAt: 0, stopAt: 0, timer: null, wakeLock: null, message: ""
};
const saveEmitterOpts = () => store.set("fonometro.emitter", emitter.opts);

function generateSignal(type, sr, level, freq) {
  let out;
  if (type === "tone") {
    // 2 s con un numero intero di periodi: il loop è continuo
    const n = sr * 2;
    out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = Math.sin(2 * Math.PI * freq * i / sr) * 0.9 * level;
    return out;
  }
  const n = sr * 8, m = Math.round(sr * 0.05), total = n + m;
  const s = new Float32Array(total);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = -5000; i < total; i++) {
    const w = Math.random() * 2 - 1;
    let v = w;
    if (type === "pink") {
      // Filtro di Paul Kellet (pendenza −3 dB/ottava)
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
      v = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    }
    if (i >= 0) s[i] = v;
  }
  let sum = 0;
  for (let i = 0; i < total; i++) sum += s[i] * s[i];
  const g = 0.3 / Math.sqrt(sum / total);
  out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // Dissolvenza incrociata sull'inizio per rendere continuo il loop
    const x = i < m ? s[i] * (i / m) + s[n + i] * (1 - i / m) : s[i];
    out[i] = 0.98 * Math.tanh((x * g) / 0.98) * level;
  }
  return out;
}

function wavBlob(samples, sr) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  return new Blob([buf], { type: "audio/wav" });
}

async function startEmission() {
  if (emitter.playing) return;
  emitter.message = "";
  if (meter.running) {
    stopMeter();
    emitter.message = "Il microfono di questo telefono è stato spento: mentre registra, l'iPhone abbassa il volume dell'altoparlante. Misura con l'altro telefono.";
  }
  const o = emitter.opts;
  const sr = 44100;
  const blob = wavBlob(generateSignal(o.signal, sr, o.level, o.freq), sr);
  emitter.url = URL.createObjectURL(blob);
  const audio = new Audio(emitter.url);
  audio.loop = true;
  audio.preload = "auto";
  audio.setAttribute("playsinline", "");
  // Con l'avvio ritardato il suono parte muto: su iPhone play() deve avvenire durante il tocco
  audio.muted = o.delay > 0;
  emitter.audio = audio;
  try {
    await audio.play();
  } catch (err) {
    emitter.message = "Il browser non ha avviato l'audio (" + (err && err.message ? err.message : err) + "). Tocca di nuovo il pulsante.";
    cleanupEmission();
    renderEmitter();
    return;
  }
  const now = Date.now();
  emitter.playing = true;
  emitter.delayEnd = now + o.delay * 1000;
  emitter.phase = o.delay > 0 ? "delay" : "on";
  emitter.startAt = o.delay > 0 ? 0 : now;
  emitter.stopAt = o.duration > 0 ? emitter.delayEnd + o.duration * 1000 : 0;
  try { emitter.wakeLock = await navigator.wakeLock?.request("screen"); } catch {}
  emitter.timer = setInterval(tickEmission, 250);
  renderEmitter();
}

function tickEmission() {
  const now = Date.now();
  if (emitter.phase === "delay" && now >= emitter.delayEnd) {
    emitter.audio.muted = false;
    emitter.phase = "on";
    emitter.startAt = now;
  }
  if (emitter.stopAt && now >= emitter.stopAt) {
    stopEmission();
    emitter.message = "Emissione terminata allo scadere della durata impostata.";
  }
  renderEmitterStatus();
}

function cleanupEmission() {
  if (emitter.audio) { try { emitter.audio.pause(); emitter.audio.src = ""; } catch {} }
  if (emitter.url) URL.revokeObjectURL(emitter.url);
  emitter.audio = null; emitter.url = null;
}

function stopEmission() {
  clearInterval(emitter.timer);
  emitter.timer = null;
  cleanupEmission();
  emitter.playing = false;
  emitter.phase = "off";
  if (emitter.wakeLock) { emitter.wakeLock.release().catch(() => {}); emitter.wakeLock = null; }
  renderEmitter();
}

// Se su questo telefono si accende il microfono, l'emissione si ferma
hooks.beforeMic.push(() => {
  if (emitter.playing) {
    stopEmission();
    emitter.message = "Emissione interrotta perché su questo telefono è stato acceso il microfono. Usa due telefoni: uno emette, l'altro misura.";
    renderEmitter();
  }
});

// ---------- Interfaccia ----------
function segmented(container, options, current, onPick) {
  container.innerHTML = "";
  for (const [value, label] of options) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.setAttribute("aria-pressed", String(value === current));
    b.addEventListener("click", () => onPick(value));
    container.appendChild(b);
  }
}

function renderEmitterStatus() {
  const st = $("emit-status"), sub = $("emit-sub"), pill = $("emit-pill");
  if (!st) return;
  const now = Date.now();
  if (emitter.phase === "delay") {
    st.textContent = "Parte tra " + Math.ceil((emitter.delayEnd - now) / 1000) + " s";
    sub.textContent = "Allontanati e chiudi la porta: il suono partirà da solo.";
  } else if (emitter.phase === "on") {
    st.textContent = "In emissione " + fmtDur((now - emitter.startAt) / 1000);
    sub.textContent = emitter.stopAt ? "Si ferma tra " + fmtDur((emitter.stopAt - now) / 1000) : "Continua finché non premi Ferma.";
  } else {
    st.textContent = "Pronto";
    sub.textContent = "Imposta il segnale qui sotto, poi avvia.";
  }
  pill.textContent = emitter.phase === "on" ? "In emissione" : emitter.phase === "delay" ? "In attesa" : "Spento";
  pill.classList.toggle("live", emitter.phase !== "off");
}

function renderEmitter() {
  if (!$("emit-btn")) return;
  const o = emitter.opts;
  const btn = $("emit-btn");
  btn.classList.toggle("on", emitter.playing);
  btn.classList.toggle("waiting", emitter.phase === "delay");
  btn.setAttribute("aria-pressed", String(emitter.playing));
  $("emit-btn-label").textContent = emitter.playing ? "Ferma" : "Avvia emissione";
  renderEmitterStatus();
  const msg = $("emit-msg");
  msg.textContent = emitter.message;
  msg.hidden = !emitter.message;

  const pick = (key, reset) => (v) => { emitter.opts[key] = v; saveEmitterOpts(); if (emitter.playing && reset) { stopEmission(); emitter.message = "Impostazione cambiata: riavvia l'emissione."; } renderEmitter(); };
  segmented($("emit-signal"), Object.entries(SIGNALS).map(([k, s]) => [k, s.label]), o.signal, pick("signal", true));
  $("emit-signal-text").textContent = SIGNALS[o.signal].text;
  $("emit-freq-wrap").hidden = o.signal !== "tone";
  segmented($("emit-freq"), TONE_FREQS.map((f) => [f, f >= 1000 ? f / 1000 + " kHz" : f + " Hz"]), o.freq, pick("freq", true));
  segmented($("emit-level"), [[1, "100%"], [0.7, "70%"], [0.5, "50%"]], o.level, pick("level", true));
  segmented($("emit-delay"), [[0, "Subito"], [10, "10 s"], [30, "30 s"], [60, "1 min"]], o.delay, pick("delay", false));
  segmented($("emit-duration"), [[0, "Continua"], [60, "1 min"], [180, "3 min"], [300, "5 min"]], o.duration, pick("duration", false));
  segmented($("emit-place"), [["rooms", "Tra due stanze"], ["facade", "Facciata"]], o.place, pick("place", false));
  $("emit-diagram").innerHTML = o.place === "facade"
    ? planFacade({ emitter: emitter.phase === "on" ? "on" : "off", measurer: null, highlight: "out", legend: "A = questo telefono, sul balcone, rivolto a 45° verso la finestra" })
    : planTwoRooms({ emitter: emitter.phase === "on" ? "on" : "off", measurer: null, highlight: "src", legend: "A = questo telefono, nell'angolo opposto alla parete divisoria" });
  $("emit-place-text").innerHTML = o.place === "facade"
    ? "<li>Appoggia il telefono sul pavimento del balcone o del giardino, a circa 2 m dalla finestra, con l'altoparlante (in basso) rivolto verso la finestra a 45°.</li><li>La finestra della stanza resta chiusa.</li><li>Senza balcone o giardino questa prova non è eseguibile in modo affidabile.</li>"
    : "<li>Appoggia il telefono sul pavimento o su una sedia nell'angolo della stanza sorgente più lontano dalla parete da provare (almeno 1,5 m).</li><li>Rivolgi l'altoparlante verso l'angolo: il suono si diffonde meglio nella stanza.</li><li>Chiudi porte e finestre e non spostare il telefono durante la prova.</li>";
}

function initEmitter() {
  $("emit-btn").addEventListener("click", () => emitter.playing ? stopEmission() : startEmission());
  renderEmitter();
}
