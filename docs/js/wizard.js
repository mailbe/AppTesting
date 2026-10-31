"use strict";

// ---------- Definizione delle prove guidate ----------
// Tipi di passo: info (istruzioni e scelte), measure (registra un livello), rt60 (battito di mani), result.
const P = (ctx, k) => ctx.params[k];
const V = (ctx, k) => ctx.values[k];
const roomTypeChoices = Object.entries(ROOM_TYPES).map(([k, r]) => [k, r.label]);

const HOLD_TIP = "Tieni il telefono a braccio teso, all'altezza del petto (1,2–1,5 m), e cammina lentamente in cerchio. Non parlare e non coprire il microfono in basso.";

const MODES = {
  isolamento: {
    title: "Isolamento tra stanze",
    icon: "wall",
    devices: 2,
    time: "≈ 10 min",
    norm: "DPCM 5/12/1997 · UNI 11367",
    summary: "Quanto suono passa attraverso una parete o una porta. Il telefono A emette rumore rosa, il telefono B misura nelle due stanze.",
    params: [
      ["B2", "rumore di fondo nella stanza ricevente, con A spento"],
      ["L1", "livello nella stanza sorgente, con A acceso"],
      ["L2", "livello nella stanza ricevente, con A acceso"],
      ["T", "riverbero della stanza ricevente"],
      ["D = L1 − L2", "differenza di livello"],
      ["DnT = D + 10·log(T/0,5)", "isolamento normalizzato, confrontato con le soglie"]
    ],
    steps: [
      {
        type: "info", title: "Preparazione",
        fields: [
          { key: "src", label: "Stanza dove suona il telefono A", kind: "text", def: "Soggiorno" },
          { key: "rcv", label: "Stanza accanto da verificare", kind: "text", def: "Camera" },
          { key: "wall", label: "Che parete stai provando?", kind: "choice", def: "units", choices: [["units", "Tra due appartamenti"], ["internal", "Dentro casa mia"]] }
        ],
        html: () => `<p>Servono <strong>due telefoni</strong> con questa pagina aperta:</p>
          <ul><li><strong>A, emettitore</strong>: resta nella stanza sorgente e usa la scheda <em>Emetti</em>.</li>
          <li><strong>B, misuratore</strong>: è questo telefono. Segue la guida e misura in entrambe le stanze.</li></ul>
          <p>Chiudi porte e finestre, spegni TV, lavatrice e ventilatori. Se puoi, collega il telefono A a una cassa Bluetooth: più forte è il segnale, più la prova è affidabile.</p>`,
        diagram: (ctx) => planTwoRooms({ srcName: P(ctx, "src"), rcvName: P(ctx, "rcv"), emitter: "off" })
      },
      {
        type: "info", title: "Posiziona il telefono A",
        html: (ctx) => `<ol><li>Sul telefono A apri la scheda <strong>Emetti</strong> e scegli <strong>Rumore rosa</strong>, livello 100%.</li>
          <li>Alza il volume al massimo con i tasti laterali.</li>
          <li>Mettilo nell'angolo di <strong>${esc(P(ctx, "src"))}</strong> più lontano dalla parete da provare, almeno a 1,5 m, con l'altoparlante rivolto verso l'angolo.</li>
          <li><strong>Non avviarlo ancora</strong>: prima si misura il rumore di fondo.</li></ol>`,
        diagram: (ctx) => planTwoRooms({ srcName: P(ctx, "src"), rcvName: P(ctx, "rcv"), emitter: "off", highlight: "src" })
      },
      {
        type: "measure", key: "B2", title: "Rumore di fondo nella stanza accanto", short: "B2",
        duration: 30, durations: [15, 30, 60],
        html: (ctx) => `<p>Con il telefono A <strong>spento</strong>, vai in <strong>${esc(P(ctx, "rcv"))}</strong> e chiudi la porta. ${HOLD_TIP}</p>`,
        diagram: (ctx) => planTwoRooms({ srcName: P(ctx, "src"), rcvName: P(ctx, "rcv"), emitter: "off", measurer: "rcv", highlight: "rcv" })
      },
      {
        type: "info", title: "Avvia l'emissione sul telefono A",
        html: (ctx) => `<ol><li>Torna in <strong>${esc(P(ctx, "src"))}</strong> e sul telefono A premi <strong>Avvia emissione</strong>.</li>
          <li>Controlla di sentire bene il fruscio. Se sei da solo, usa l'avvio ritardato di 10 s.</li>
          <li>Da qui in poi non spostare il telefono A.</li></ol>`,
        diagram: (ctx) => planTwoRooms({ srcName: P(ctx, "src"), rcvName: P(ctx, "rcv"), emitter: "on", highlight: "src" })
      },
      {
        type: "measure", key: "L1", title: "Livello nella stanza sorgente (L1)", short: "L1",
        duration: 30, durations: [15, 30, 60],
        html: (ctx) => `<p>Resta in <strong>${esc(P(ctx, "src"))}</strong> con il telefono A acceso. Stai ad almeno 1 m da A e a 0,5 m dalle pareti. ${HOLD_TIP}</p>`,
        diagram: (ctx) => planTwoRooms({ srcName: P(ctx, "src"), rcvName: P(ctx, "rcv"), emitter: "on", measurer: "src", highlight: "src" }),
        check: (ctx, r) => r.leqA < 70 ? `Il segnale è debole (${fmt(r.leqA)} dB(A)). Alza il volume del telefono A o collegalo a una cassa Bluetooth, poi ripeti la misura.` : null
      },
      {
        type: "measure", key: "L2", title: "Livello nella stanza accanto (L2)", short: "L2",
        duration: 30, durations: [15, 30, 60],
        html: (ctx) => `<p>Vai in <strong>${esc(P(ctx, "rcv"))}</strong> e chiudi bene la porta. Il telefono A continua a suonare. ${HOLD_TIP}</p>`,
        diagram: (ctx) => planTwoRooms({ srcName: P(ctx, "src"), rcvName: P(ctx, "rcv"), emitter: "on", measurer: "rcv", highlight: "rcv" }),
        check: (ctx, r) => {
          const b = V(ctx, "B2");
          return b && r.leqA - b.leqA < 6 ? `Il suono di prova supera il rumore di fondo di soli ${fmt(r.leqA - b.leqA)} dB: il risultato sarà un valore limite. Un segnale più forte in ${P(ctx, "src")} migliora la prova.` : null;
        }
      },
      {
        type: "rt60", key: "T2", title: "Riverbero della stanza accanto (T)", optional: true,
        html: (ctx) => `<p>Ferma il telefono A. In <strong>${esc(P(ctx, "rcv"))}</strong> appoggia questo telefono su un mobile all'altezza di circa 1,2 m, allontanati di 2 m e fai 2 o 3 prove con un battito di mani. Il riverbero serve per normalizzare il risultato.</p>`,
        diagram: (ctx) => planOneRoom({ variant: "rt60", roomName: P(ctx, "rcv") })
      },
      { type: "result", title: "Risultato", compute: computeInsulation }
    ]
  },

  facciata: {
    title: "Isolamento di facciata",
    icon: "window",
    devices: 2,
    time: "≈ 10 min",
    norm: "DPCM 5/12/1997 · UNI 11367",
    summary: "Quanto la facciata e le finestre ti proteggono dai rumori esterni. A emette dal balcone, B misura fuori e dentro.",
    params: [
      ["B2", "rumore di fondo nella stanza, con A spento"],
      ["L1,2m", "livello all'esterno, a 2 m dalla facciata"],
      ["L2", "livello nella stanza, finestra chiusa"],
      ["T", "riverbero della stanza"],
      ["D2m,nT = L1 − L2 + 10·log(T/0,5)", "isolamento di facciata normalizzato"]
    ],
    steps: [
      {
        type: "info", title: "Preparazione",
        fields: [{ key: "room", label: "Stanza da verificare", kind: "text", def: "Camera" }],
        html: () => `<p>Servono <strong>due telefoni</strong> e un <strong>balcone, terrazzo o giardino</strong> davanti alla finestra della stanza. Il telefono A emette dall'esterno, il telefono B (questo) misura fuori e dentro.</p>
          <p>Nelle prove ufficiali si usa una cassa potente a più di 5 m dalla facciata: con un telefono il risultato è indicativo e tende a sottostimare l'isolamento delle finestre migliori.</p>`,
        diagram: (ctx) => planFacade({ roomName: P(ctx, "room"), emitter: "off" })
      },
      {
        type: "info", title: "Posiziona il telefono A all'esterno",
        html: () => `<ol><li>Sul telefono A apri <strong>Emetti</strong>, scegli <strong>Rumore rosa</strong>, livello 100% e volume al massimo.</li>
          <li>Appoggialo sul balcone a circa 2 m dalla finestra, con l'altoparlante rivolto verso la finestra a 45°.</li>
          <li>Chiudi la finestra. <strong>Non avviarlo ancora.</strong></li></ol>`,
        diagram: (ctx) => planFacade({ roomName: P(ctx, "room"), emitter: "off", highlight: "out" })
      },
      {
        type: "measure", key: "B2", title: "Rumore di fondo nella stanza", short: "B2",
        duration: 30, durations: [15, 30, 60],
        html: (ctx) => `<p>Con il telefono A <strong>spento</strong> e la finestra chiusa, misura in <strong>${esc(P(ctx, "room"))}</strong>. ${HOLD_TIP}</p>`,
        diagram: (ctx) => planFacade({ roomName: P(ctx, "room"), emitter: "off", measurer: "in", highlight: "in" })
      },
      {
        type: "info", title: "Avvia l'emissione sul telefono A",
        html: () => `<p>Sul telefono A premi <strong>Avvia emissione</strong> e verifica di sentire il fruscio dal balcone. Non spostarlo più fino alla fine.</p>`,
        diagram: (ctx) => planFacade({ roomName: P(ctx, "room"), emitter: "on", highlight: "out" })
      },
      {
        type: "measure", key: "L1", title: "Livello all'esterno (L1,2m)", short: "L1",
        duration: 30, durations: [15, 30, 60],
        html: () => `<p>Esci e mettiti a <strong>2 m davanti alla finestra</strong>, all'altezza del centro della finestra, ad almeno 1 m dal telefono A. Muovi lentamente il telefono parallelamente alla facciata.</p>`,
        diagram: (ctx) => planFacade({ roomName: P(ctx, "room"), emitter: "on", measurer: "out", highlight: "out" }),
        check: (ctx, r) => r.leqA < 70 ? `Il segnale è debole (${fmt(r.leqA)} dB(A)). Avvicina il telefono A o usa una cassa Bluetooth.` : null
      },
      {
        type: "measure", key: "L2", title: "Livello nella stanza (L2)", short: "L2",
        duration: 30, durations: [15, 30, 60],
        html: (ctx) => `<p>Rientra in <strong>${esc(P(ctx, "room"))}</strong> e chiudi bene la finestra. Il telefono A continua a suonare. ${HOLD_TIP}</p>`,
        diagram: (ctx) => planFacade({ roomName: P(ctx, "room"), emitter: "on", measurer: "in", highlight: "in" }),
        check: (ctx, r) => {
          const b = V(ctx, "B2");
          return b && r.leqA - b.leqA < 6 ? `Il suono di prova supera il rumore di fondo di soli ${fmt(r.leqA - b.leqA)} dB: il risultato sarà un valore limite.` : null;
        }
      },
      {
        type: "rt60", key: "T2", title: "Riverbero della stanza (T)", optional: true,
        html: (ctx) => `<p>Ferma il telefono A. In <strong>${esc(P(ctx, "room"))}</strong> appoggia questo telefono a circa 1,2 m da terra, allontanati di 2 m e fai 2 o 3 prove battendo le mani.</p>`,
        diagram: (ctx) => planOneRoom({ variant: "rt60", roomName: P(ctx, "room") })
      },
      { type: "result", title: "Risultato", compute: computeFacade }
    ]
  },

  impianti: {
    title: "Rumore degli impianti",
    icon: "pipe",
    devices: 1,
    time: "≈ 5 min",
    norm: "DPCM 5/12/1997 · UNI 11367",
    summary: "Scarichi, ascensore, caldaia, climatizzatore: misura il rumore che arriva in una stanza e confrontalo con i limiti.",
    params: [
      ["B", "rumore di fondo con l'impianto spento"],
      ["LASmax", "massimo con risposta Slow, per impianti a funzionamento discontinuo (scarichi, ascensori)"],
      ["LAeq", "livello equivalente, per impianti a funzionamento continuo (caldaia, climatizzazione)"]
    ],
    steps: [
      {
        type: "info", title: "Preparazione",
        fields: [
          { key: "room", label: "Stanza dove misuri", kind: "text", def: "Camera" },
          { key: "plant", label: "Impianto", kind: "text", def: "Scarico WC" },
          { key: "kind", label: "Come funziona l'impianto?", kind: "choice", def: "disc", choices: [["disc", "A intermittenza (scarico, ascensore)"], ["cont", "Continuo (caldaia, clima)"]] }
        ],
        html: () => `<p>La legge si applica al rumore degli impianti al servizio di <strong>altre unità</strong> (per esempio lo scarico o l'ascensore dei vicini), misurato nella tua stanza più disturbata. Puoi usare la prova anche per gli impianti di casa tua, come confronto.</p>
          <p>Chiudi porte e finestre. Serve qualcuno che faccia funzionare l'impianto quando te lo indica la guida.</p>`,
        diagram: (ctx) => planTwoRooms({ srcName: "Locale dell'impianto", rcvName: P(ctx, "room"), emitter: "off", plant: true, measurer: "rcv", highlight: "rcv", legend: "B = questo telefono, nella stanza da verificare" })
      },
      {
        type: "measure", key: "B", title: "Rumore di fondo (impianto spento)", short: "B",
        duration: 30, durations: [15, 30, 60],
        html: (ctx) => `<p>Con l'impianto <strong>spento</strong>, misura in <strong>${esc(P(ctx, "room"))}</strong>, al centro della stanza. ${HOLD_TIP}</p>`,
        diagram: (ctx) => planTwoRooms({ srcName: "Locale dell'impianto", rcvName: P(ctx, "room"), emitter: "off", plant: true, measurer: "rcv", highlight: "rcv", legend: "B = questo telefono, nella stanza da verificare" })
      },
      {
        type: "measure", key: "Li", title: "Impianto in funzione", short: "Li",
        manual: (ctx) => P(ctx, "kind") === "disc",
        duration: 60, durations: [30, 60, 120],
        html: (ctx) => P(ctx, "kind") === "disc"
          ? `<p>Premi <strong>Avvia misura</strong>, poi fai attivare <strong>${esc(P(ctx, "plant"))}</strong>. Premi <strong>Termina</strong> quando il rumore è finito. Conta il valore massimo LASmax.</p>`
          : `<p>Fai accendere <strong>${esc(P(ctx, "plant"))}</strong> e aspetta che vada a regime, poi avvia la misura. Conta il livello equivalente LAeq.</p>`,
        diagram: (ctx) => planTwoRooms({ srcName: "Locale dell'impianto", rcvName: P(ctx, "room"), emitter: "on", plant: true, measurer: "rcv", highlight: "rcv", legend: "B = questo telefono, nella stanza da verificare" })
      },
      { type: "result", title: "Risultato", compute: computePlant }
    ]
  },

  differenziale: {
    title: "Rumore da vicini o esterno",
    icon: "ear",
    devices: 1,
    time: "≈ 5 min",
    norm: "DPCM 14/11/1997 (criterio differenziale)",
    summary: "Musica dei vicini, locali, condizionatori esterni: confronta il rumore con e senza la sorgente disturbante.",
    params: [
      ["LR – residuo", "rumore con la sorgente disturbante spenta o assente"],
      ["LA – ambientale", "rumore con la sorgente disturbante attiva"],
      ["LA − LR", "differenza confrontata con il limite di 5 dB(A) di giorno e 3 dB(A) di notte"]
    ],
    steps: [
      {
        type: "info", title: "Preparazione",
        fields: [
          { key: "room", label: "Stanza dove misuri", kind: "text", def: "Camera" },
          { key: "source", label: "Sorgente disturbante", kind: "text", def: "Musica dei vicini" },
          { key: "period", label: "Periodo", kind: "choice", def: "night", choices: [["day", "Giorno (6–22)"], ["night", "Notte (22–6)"]] },
          { key: "windows", label: "Finestre", kind: "choice", def: "closed", choices: [["closed", "Chiuse"], ["open", "Aperte"]] }
        ],
        html: () => `<p>Il criterio differenziale confronta il rumore <strong>con</strong> la sorgente disturbante e <strong>senza</strong>. Misura nella stanza dove il disturbo è maggiore, a circa 1 m dalla finestra o dalla parete da cui arriva il rumore.</p>
          <p>Se non puoi spegnere la sorgente, misura il residuo in un momento in cui è assente, alla stessa ora di un altro giorno.</p>`,
        diagram: (ctx) => planOneRoom({ variant: "diff", roomName: P(ctx, "room"), windows: P(ctx, "windows") })
      },
      {
        type: "measure", key: "LR", title: "Rumore residuo (sorgente spenta)", short: "LR",
        duration: 60, durations: [30, 60, 120, 300],
        html: (ctx) => `<p>Senza <strong>${esc(P(ctx, "source"))}</strong>, con le finestre ${P(ctx, "windows") === "open" ? "aperte" : "chiuse"}. Resta fermo a 1 m dalla finestra, a braccio teso.</p>`,
        diagram: (ctx) => planOneRoom({ variant: "diff", roomName: P(ctx, "room"), windows: P(ctx, "windows") })
      },
      {
        type: "measure", key: "LA", title: "Rumore ambientale (sorgente attiva)", short: "LA",
        duration: 60, durations: [30, 60, 120, 300],
        html: (ctx) => `<p>Ora con <strong>${esc(P(ctx, "source"))}</strong> attiva, nella stessa posizione e con le finestre ${P(ctx, "windows") === "open" ? "aperte" : "chiuse"}.</p>`,
        diagram: (ctx) => planOneRoom({ variant: "diff", roomName: P(ctx, "room"), windows: P(ctx, "windows") })
      },
      { type: "result", title: "Risultato", compute: computeDifferential }
    ]
  },

  fondo: {
    title: "Rumore di fondo",
    icon: "wave",
    devices: 1,
    time: "≈ 3 min",
    norm: "Linee guida OMS",
    summary: "Quanto è silenziosa una stanza con porte e finestre chiuse. Ideale per confrontare le camere e capire l'isolamento dal traffico.",
    params: [
      ["LAeq", "livello equivalente: il valore confrontato con le linee guida"],
      ["LAFmax", "il picco più alto, importante per il sonno (eventi singoli)"]
    ],
    steps: [
      {
        type: "info", title: "Preparazione",
        fields: [
          { key: "room", label: "Stanza", kind: "text", def: "Camera" },
          { key: "type", label: "Tipo di stanza", kind: "choice", def: "camera", choices: roomTypeChoices }
        ],
        html: () => `<p>Chiudi porte e finestre, spegni TV, ventilatori e apparecchi rumorosi. Misura in momenti diversi: di notte e nelle ore di punta del traffico.</p>`,
        diagram: (ctx) => planOneRoom({ variant: "fondo", roomName: P(ctx, "room") }),
        elevation: true
      },
      {
        type: "measure", key: "L", title: "Misura del rumore di fondo", short: "L",
        duration: 120, durations: [60, 120, 300],
        html: (ctx) => `<p>Al centro di <strong>${esc(P(ctx, "room"))}</strong>, ad almeno 1 m dalle pareti. Puoi anche appoggiare il telefono su un supporto a 1,2 m e uscire dalla stanza.</p>`,
        diagram: (ctx) => planOneRoom({ variant: "fondo", roomName: P(ctx, "room") })
      },
      { type: "result", title: "Risultato", compute: computeBackground }
    ]
  },

  rt60: {
    title: "Riverbero (RT60)",
    icon: "clap",
    devices: 1,
    time: "≈ 3 min",
    norm: "Valori di comfort",
    summary: "Quanto rimbomba una stanza. Basta battere le mani: utile per decidere tappeti, tende e pannelli.",
    params: [
      ["RT60 (T)", "il tempo in secondi in cui il suono cala di 60 dB"],
      ["T20 / T10", "il metodo usato: la pendenza del decadimento misurata su 20 o 10 dB e riportata a 60 dB"]
    ],
    steps: [
      {
        type: "info", title: "Preparazione",
        fields: [
          { key: "room", label: "Stanza", kind: "text", def: "Soggiorno" },
          { key: "type", label: "Tipo di stanza", kind: "choice", def: "soggiorno", choices: roomTypeChoices }
        ],
        html: () => `<p>Appoggia il telefono su un mobile o un supporto a circa 1,2 m da terra, lontano dalle pareti. Mettiti ad almeno 2 m e batti le mani una volta, forte e secco. Ripeti 3–5 volte cambiando la tua posizione o quella del telefono.</p>`,
        diagram: (ctx) => planOneRoom({ variant: "rt60", roomName: P(ctx, "room") })
      },
      {
        type: "rt60", key: "T", title: "Prove con il battito di mani",
        html: () => `<p>Premi <strong>Avvia prova</strong>, resta in silenzio un secondo e batti le mani quando richiesto.</p>`,
        diagram: (ctx) => planOneRoom({ variant: "rt60", roomName: P(ctx, "room") })
      },
      { type: "result", title: "Risultato", compute: computeReverb }
    ]
  }
};
const MODE_ORDER = ["isolamento", "facciata", "impianti", "differenziale", "fondo", "rt60"];

// ---------- Calcolo dei risultati ----------
function tAssumed(ctx, key) {
  const t = V(ctx, key);
  return t && t.avg ? { T: t.avg, assumed: false } : { T: 0.5, assumed: true };
}

function computeInsulation(ctx) {
  const L1 = V(ctx, "L1").leqA, L2 = V(ctx, "L2").leqA, B2 = V(ctx, "B2")?.leqA;
  const corr = backgroundCorrect(L2, B2);
  const D = L1 - corr.value;
  const { T, assumed } = tAssumed(ctx, "T2");
  const DnT = D + 10 * Math.log10(T / 0.5);
  const units = P(ctx, "wall") === "units";
  const notes = [];
  if (corr.note) notes.push(corr.note);
  if (assumed) notes.push("Riverbero non misurato: è stato usato il valore di riferimento T = 0,5 s.");
  if (L1 < 75) notes.push(`Il livello nella stanza sorgente è basso (${fmt(L1)} dB(A)): con una sorgente più forte l'isolamento misurato potrebbe risultare più alto.`);
  notes.push("Stima a banda larga in dB(A), confrontabile solo in modo indicativo con l'indice R'w di legge.");
  let verdict, chart;
  if (units) {
    const cls = uniClass(DnT, NORMS.units.classes);
    const ok = DnT >= NORMS.units.limit;
    verdict = ok
      ? { tone: "good", title: "In linea con il limite di legge", text: `Isolamento stimato ${fmt(DnT)} dB, sopra i 50 dB richiesti tra appartamenti. Classe UNI 11367 indicativa: ${cls}.` }
      : { tone: "bad", title: "Sotto il limite di legge", text: `Isolamento stimato ${fmt(DnT)} dB, sotto i 50 dB richiesti tra appartamenti. Ripeti la prova; se il risultato si conferma, rivolgiti a un tecnico competente in acustica.` };
    chart = scaleChart({ min: 25, max: 65, step: 5, bands: classBands(NORMS.units.classes, 25, 65), lines: [{ v: 50, label: "limite di legge 50 dB" }], value: DnT, valueText: `DnT ${fmt(DnT)} dB`, title: "Isolamento rispetto alle classi UNI 11367" });
  } else {
    const g = NORMS.internal;
    verdict = DnT >= g.good
      ? { tone: "good", title: "Buon isolamento", text: `${fmt(DnT)} dB: una conversazione normale nella stanza accanto non si capisce.` }
      : DnT >= g.fair
        ? { tone: "warn", title: "Isolamento discreto", text: `${fmt(DnT)} dB: si sentono voci e TV, ma attenuate. Tipico di un tramezzo leggero o di una porta normale.` }
        : { tone: "bad", title: "Isolamento scarso", text: `${fmt(DnT)} dB: le voci si capiscono. Controlla porta, fessure, prese elettriche passanti e cassonetti.` };
    notes.push("Per le pareti interne alla stessa abitazione la legge non fissa limiti: le fasce sono riferimenti di comfort.");
    chart = scaleChart({ min: 15, max: 65, step: 5, bands: [{ from: 15, to: g.fair, tone: "bad", label: "scarso" }, { from: g.fair, to: g.good, tone: "warn", label: "discreto" }, { from: g.good, to: 65, tone: "good", label: "buono" }], value: DnT, valueText: `DnT ${fmt(DnT)} dB`, title: "Isolamento rispetto ai riferimenti di comfort" });
  }
  return {
    headline: ["DnT stimato", fmt(DnT), "dB"],
    verdict, chart, notes,
    rows: [
      ["L1 · stanza sorgente", fmt(L1) + " dB(A)"],
      ["L2 · stanza accanto", fmt(L2) + " dB(A)"],
      ["B2 · rumore di fondo", B2 != null ? fmt(B2) + " dB(A)" : "non misurato"],
      ["L2 corretto", fmt(corr.value) + " dB(A)"],
      ["D = L1 − L2", fmt(D) + " dB"],
      ["T · riverbero", fmt(T, 2) + " s" + (assumed ? " (riferimento)" : "")],
      ["DnT = D + 10·log(T/0,5)", fmt(DnT) + " dB"]
    ],
    room: P(ctx, "rcv"),
    save: { type: "insulation", room: P(ctx, "rcv"), from: P(ctx, "src"), wall: P(ctx, "wall"), l1: L1, l2: L2, b: B2, t: T, d: D, value: DnT, limit: corr.limit, pass: units ? DnT >= NORMS.units.limit : null }
  };
}

function computeFacade(ctx) {
  const L1 = V(ctx, "L1").leqA, L2 = V(ctx, "L2").leqA, B2 = V(ctx, "B2")?.leqA;
  const corr = backgroundCorrect(L2, B2);
  const D = L1 - corr.value;
  const { T, assumed } = tAssumed(ctx, "T2");
  const Dn = D + 10 * Math.log10(T / 0.5);
  const ok = Dn >= NORMS.facade.limit;
  const cls = uniClass(Dn, NORMS.facade.classes);
  const notes = [];
  if (corr.note) notes.push(corr.note);
  if (assumed) notes.push("Riverbero non misurato: è stato usato il valore di riferimento T = 0,5 s.");
  notes.push("Stima a banda larga in dB(A) con una sorgente debole: confronto indicativo con l'indice D2m,nT,w di legge.");
  return {
    headline: ["D2m,nT stimato", fmt(Dn), "dB"],
    verdict: ok
      ? { tone: "good", title: "In linea con il limite di legge", text: `Isolamento di facciata stimato ${fmt(Dn)} dB, sopra i 40 dB richiesti per le abitazioni. Classe UNI 11367 indicativa: ${cls}.` }
      : { tone: "bad", title: "Sotto il limite di legge", text: `Isolamento di facciata stimato ${fmt(Dn)} dB, sotto i 40 dB richiesti. I punti deboli più comuni sono guarnizioni, cassonetti delle tapparelle e prese d'aria.` },
    chart: scaleChart({ min: 20, max: 55, step: 5, bands: classBands(NORMS.facade.classes, 20, 55), lines: [{ v: 40, label: "limite di legge 40 dB" }], value: Dn, valueText: `D2m,nT ${fmt(Dn)} dB`, title: "Isolamento di facciata rispetto alle classi UNI 11367" }),
    notes,
    rows: [
      ["L1,2m · esterno", fmt(L1) + " dB(A)"],
      ["L2 · interno", fmt(L2) + " dB(A)"],
      ["B2 · rumore di fondo", B2 != null ? fmt(B2) + " dB(A)" : "non misurato"],
      ["L2 corretto", fmt(corr.value) + " dB(A)"],
      ["T · riverbero", fmt(T, 2) + " s" + (assumed ? " (riferimento)" : "")],
      ["D2m,nT", fmt(Dn) + " dB"]
    ],
    room: P(ctx, "room"),
    save: { type: "facade", room: P(ctx, "room"), l1: L1, l2: L2, b: B2, t: T, value: Dn, limit: corr.limit, pass: ok }
  };
}

function computePlant(ctx) {
  const disc = P(ctx, "kind") === "disc";
  const Li = V(ctx, "Li"), B = V(ctx, "B")?.leqA;
  const notes = [];
  let value;
  if (disc) {
    value = Li.lasmax;
    if (B != null && value - B < 6) notes.push(`Il massimo supera il rumore di fondo di soli ${fmt(value - B)} dB: il rumore dell'impianto è appena distinguibile.`);
  } else {
    const corr = backgroundCorrect(Li.leqA, B);
    value = corr.value;
    if (corr.note) notes.push(corr.note);
  }
  const n = disc ? NORMS.impDisc : NORMS.impCont;
  const ok = value <= n.limit;
  const cls = uniClass(value, n.classes, false);
  const name = disc ? "LASmax" : "LAeq";
  notes.push("La legge vale per gli impianti al servizio di altre unità immobiliari, misurati nell'ambiente più disturbato.");
  return {
    headline: [name, fmt(value), "dB(A)"],
    verdict: ok
      ? { tone: "good", title: "Entro il limite di legge", text: `${P(ctx, "plant")}: ${name} ${fmt(value)} dB(A), entro il limite di ${n.limit} dB(A). Classe UNI 11367 indicativa: ${cls}.` }
      : { tone: "bad", title: "Oltre il limite di legge", text: `${P(ctx, "plant")}: ${name} ${fmt(value)} dB(A), oltre il limite di ${n.limit} dB(A) per gli impianti ${disc ? "a funzionamento discontinuo" : "a funzionamento continuo"}.` },
    chart: scaleChart({ min: 15, max: 55, step: 5, bands: classBands(n.classes, 15, 55, false), lines: [{ v: n.limit, label: `limite di legge ${n.limit} dB(A)` }], value, valueText: `${name} ${fmt(value)} dB(A)`, title: "Rumore dell'impianto rispetto alle classi UNI 11367" }),
    notes,
    rows: [
      ["B · fondo, impianto spento", B != null ? fmt(B) + " dB(A)" : "non misurato"],
      ["LAeq con impianto", fmt(Li.leqA) + " dB(A)"],
      ["LASmax con impianto", fmt(Li.lasmax) + " dB(A)"],
      ["Durata della misura", fmtDur(Li.duration)]
    ],
    room: P(ctx, "room"),
    save: { type: "impianti", room: P(ctx, "room"), plant: P(ctx, "plant"), kind: P(ctx, "kind"), value, b: B, pass: ok }
  };
}

function computeDifferential(ctx) {
  const round05 = (x) => Math.round(x * 2) / 2;
  const LA = round05(V(ctx, "LA").leqA), LR = round05(V(ctx, "LR").leqA);
  const period = P(ctx, "period"), windows = P(ctx, "windows");
  const limit = NORMS.differential.limit[period];
  const appl = NORMS.differential.applicability[windows][period];
  const diff = Math.max(0, LA - LR);
  const applicable = LA >= appl;
  const periodTxt = period === "day" ? "di giorno" : "di notte";
  const winTxt = windows === "open" ? "aperte" : "chiuse";
  let verdict;
  if (!applicable) {
    verdict = { tone: "good", title: "Rumore trascurabile", text: `Con finestre ${winTxt} ${periodTxt}, sotto ${appl} dB(A) di rumore ambientale il criterio differenziale non si applica: per la legge il disturbo è trascurabile (misurati ${fmt(LA)} dB(A)).` };
  } else if (diff <= limit) {
    verdict = { tone: "good", title: "Entro il limite differenziale", text: `Differenza ${fmt(diff)} dB(A), entro il limite di ${limit} dB(A) ${periodTxt}.` };
  } else {
    verdict = { tone: "bad", title: "Oltre il limite differenziale", text: `Differenza ${fmt(diff)} dB(A), oltre il limite di ${limit} dB(A) ${periodTxt}. Per far valere i tuoi diritti serve una misura di un tecnico competente in acustica (puoi chiederla anche all'ARPA tramite il Comune).` };
  }
  return {
    headline: ["LA − LR", fmt(diff), "dB(A)"],
    verdict,
    chart: scaleChart({ min: 0, max: 12, step: 2, bands: [{ from: 0, to: limit, tone: "good", label: "entro il limite" }, { from: limit, to: 12, tone: "bad", label: "oltre" }], lines: [{ v: limit, label: `limite ${periodTxt} ${limit} dB(A)` }], value: diff, valueText: `differenza ${fmt(diff)} dB(A)`, title: "Differenza tra rumore ambientale e residuo" }),
    notes: [
      `Il criterio si applica solo se il rumore ambientale supera ${appl} dB(A) (finestre ${winTxt}, ${periodTxt}).`,
      "I valori sono arrotondati a 0,5 dB come prevede la normativa.",
      "Il criterio non si applica a traffico stradale, ferroviario e aereo."
    ],
    rows: [
      ["LR · residuo", fmt(LR) + " dB(A)"],
      ["LA · ambientale", fmt(LA) + " dB(A)"],
      ["Soglia di applicabilità", appl + " dB(A)"],
      ["Differenza LA − LR", fmt(diff) + " dB(A)"]
    ],
    room: P(ctx, "room"),
    save: { type: "differenziale", room: P(ctx, "room"), source: P(ctx, "source"), period, windows, la: LA, lr: LR, value: diff, applicable, pass: !applicable || diff <= limit }
  };
}

function computeBackground(ctx) {
  const r = V(ctx, "L");
  const rt = ROOM_TYPES[P(ctx, "type")];
  const ref = rt.noise;
  const v = r.leqA;
  const verdict = v <= ref
    ? { tone: "good", title: "Stanza silenziosa", text: `${fmt(v)} dB(A), entro i ${ref} dB(A) consigliati dall'OMS per ${rt.label.toLowerCase()} (${rt.noiseLabel}).` }
    : v <= ref + 10
      ? { tone: "warn", title: "Un po' rumorosa", text: `${fmt(v)} dB(A), ${fmt(v - ref)} dB sopra i ${ref} dB(A) consigliati dall'OMS. Verifica finestre, cassonetti e prese d'aria.` }
      : { tone: "bad", title: "Rumorosa", text: `${fmt(v)} dB(A), oltre 10 dB sopra i ${ref} dB(A) consigliati dall'OMS.` };
  const notes = [];
  if (rt.noiseMax && r.lafmax > rt.noiseMax) notes.push(`Il picco LAFmax (${fmt(r.lafmax)} dB(A)) supera i ${rt.noiseMax} dB(A) che l'OMS indica come soglia per i disturbi del sonno.`);
  notes.push("Le linee guida OMS sono raccomandazioni per la salute, non limiti di legge.");
  return {
    headline: ["LAeq", fmt(v), "dB(A)"],
    verdict,
    chart: scaleChart({ min: 15, max: 65, step: 5, bands: [{ from: 15, to: ref, tone: "good", label: "consigliato" }, { from: ref, to: ref + 10, tone: "warn", label: "" }, { from: ref + 10, to: 65, tone: "bad", label: "rumoroso" }], lines: [{ v: ref, label: `OMS ${ref} dB(A)` }], value: v, valueText: `LAeq ${fmt(v)} dB(A)`, title: "Rumore di fondo rispetto alle linee guida OMS" }),
    notes,
    rows: [
      ["LAeq", fmt(r.leqA) + " dB(A)"],
      ["LAFmax", fmt(r.lafmax) + " dB(A)"],
      ["LAFmin", fmt(r.lafmin) + " dB(A)"],
      ["LZeq (non pesato)", fmt(r.leqZ) + " dB(Z)"],
      ["Durata", fmtDur(r.duration)]
    ],
    room: P(ctx, "room"),
    save: { type: "leq", room: P(ctx, "room"), roomType: P(ctx, "type"), weighting: "A", leq: r.leqA, max: r.lafmax, min: r.lafmin, duration: r.duration }
  };
}

function computeReverb(ctx) {
  const t = V(ctx, "T");
  const rt = ROOM_TYPES[P(ctx, "type")];
  const [lo, hi] = rt.rt;
  const v = t.avg;
  const verdict = v < lo
    ? { tone: "warn", title: "Stanza molto secca", text: `${fmt(v, 2)} s, sotto la fascia consigliata ${fmt(lo, 1)}–${fmt(hi, 1)} s per ${rt.label.toLowerCase()}. Può sembrare ovattata.` }
    : v <= hi
      ? { tone: "good", title: "Riverbero equilibrato", text: `${fmt(v, 2)} s, nella fascia consigliata ${fmt(lo, 1)}–${fmt(hi, 1)} s per ${rt.label.toLowerCase()}.` }
      : { tone: v <= hi + 0.3 ? "warn" : "bad", title: "Stanza riverberante", text: `${fmt(v, 2)} s, sopra la fascia consigliata ${fmt(lo, 1)}–${fmt(hi, 1)} s. Tappeti, tende, librerie piene o pannelli fonoassorbenti riducono l'eco.` };
  return {
    headline: ["RT60 medio", fmt(v, 2), "s"],
    verdict,
    chart: scaleChart({ min: 0, max: 1.6, step: 0.2, decimals: 1, bands: [{ from: 0, to: lo, tone: "warn", label: "secca" }, { from: lo, to: hi, tone: "good", label: "consigliato" }, { from: hi, to: hi + 0.3, tone: "warn", label: "" }, { from: hi + 0.3, to: 1.6, tone: "bad", label: "rimbomba" }], value: v, valueText: `RT60 ${fmt(v, 2)} s`, title: "Riverbero rispetto alla fascia consigliata" }),
    notes: ["Per le abitazioni non esistono limiti di legge sul riverbero: le fasce sono riferimenti di comfort acustico."],
    rows: [["Prove eseguite", String(t.trials.length)], ...t.trials.map((x, i) => [`Prova ${i + 1}`, fmt(x, 2) + " s"]), ["Media", fmt(v, 2) + " s"]],
    room: P(ctx, "room"),
    save: { type: "rt60", room: P(ctx, "room"), roomType: P(ctx, "type"), rt60: v, trials: t.trials.length }
  };
}

// ---------- Esecuzione guidata ----------
const wizard = { modeId: null, step: 0, ctx: null, m: { phase: "idle" }, timer: null, saved: false };

function openMode(id) {
  const mode = MODES[id];
  const params = {};
  mode.steps.forEach((s) => (s.fields || []).forEach((f) => { params[f.key] = f.def; }));
  Object.assign(wizard, { modeId: id, step: 0, ctx: { params, values: {} }, saved: false });
  enterStep();
}
function closeMode() { leaveStep(); wizard.modeId = null; renderTests(); }
function currentStep() { return MODES[wizard.modeId].steps[wizard.step]; }

function leaveStep() {
  clearInterval(wizard.timer); wizard.timer = null;
  capture.cancel();
  if (reverb.isActive()) reverb.cancel();
}
function enterStep() {
  leaveStep();
  const s = currentStep();
  wizard.m = { phase: V(wizard.ctx, s.key) ? "done" : "idle", warning: null };
  if (s.type === "measure" && wizard.m.phase === "done" && s.check) wizard.m.warning = s.check(wizard.ctx, V(wizard.ctx, s.key));
  if (s.type === "rt60") {
    // clear() avvisa i listener e azzererebbe il valore salvato: lo ripristino subito dopo
    const prev = V(wizard.ctx, s.key);
    reverb.clear();
    reverb.results = [...(prev?.trials || [])];
    wizard.ctx.values[s.key] = prev;
  }
  renderTests();
  window.scrollTo(0, 0);
}
function goStep(delta) {
  const steps = MODES[wizard.modeId].steps;
  wizard.step = Math.min(Math.max(wizard.step + delta, 0), steps.length - 1);
  enterStep();
}
function stepReady(s) {
  if (s.type === "measure") return !!V(wizard.ctx, s.key);
  if (s.type === "rt60") return !!V(wizard.ctx, s.key);
  return true;
}

async function startStepMeasure() {
  const s = currentStep();
  if (!meter.running) {
    wizard.m = { phase: "starting" };
    renderTests();
    const ok = await startMeter();
    if (!ok) { wizard.m = { phase: "idle", error: meter.error }; renderTests(); return; }
  }
  const manual = typeof s.manual === "function" ? s.manual(wizard.ctx) : !!s.manual;
  const dur = manual ? null : (wizard.ctx.params["dur_" + s.key] || s.duration);
  wizard.m = { phase: "countdown", count: 3, manual };
  renderTests();
  wizard.timer = setInterval(() => {
    wizard.m.count--;
    if (wizard.m.count > 0) { renderTests(); return; }
    clearInterval(wizard.timer); wizard.timer = null;
    wizard.m = { phase: "recording", manual, duration: dur };
    capture.start({
      duration: manual ? 300 : dur,
      onDone: (r) => {
        wizard.ctx.values[s.key] = r;
        wizard.m = { phase: "done", warning: s.check ? s.check(wizard.ctx, r) : null };
        renderTests();
      }
    });
    renderTests();
  }, 1000);
}
function cancelStepMeasure() {
  leaveStep();
  wizard.m = { phase: V(wizard.ctx, currentStep().key) ? "done" : "idle" };
  renderTests();
}

// Aggiornamento in tempo reale durante le misure
function updateWizardLive() {
  if (!wizard.modeId || currentView !== "tests") return;
  const lv = $("w-live");
  if (lv) lv.textContent = meter.levelFS == null ? "–" : fmt(cal(meter.levelFS));
  const p = capture.partial();
  if (p && wizard.m.phase === "recording") {
    const bar = $("w-progress");
    if (bar) bar.style.width = (p.duration ? Math.min(100, p.t / p.duration * 100) : Math.min(100, p.t / 300 * 100)) + "%";
    const t = $("w-time");
    if (t) t.textContent = p.duration ? `${fmtDur(p.t)} / ${fmtDur(p.duration)}` : fmtDur(p.t);
    const lq = $("w-leq");
    if (lq) lq.textContent = fmt(p.leqA);
  }
}
hooks.level.push(updateWizardLive);
reverb.listeners.push(() => {
  if (!wizard.modeId) return;
  const s = currentStep();
  if (s.type !== "rt60") return;
  wizard.ctx.values[s.key] = reverb.results.length ? { avg: reverb.average(), trials: [...reverb.results] } : undefined;
  if (currentView === "tests") renderTests();
});

// ---------- Interfaccia della scheda Prove ----------
const MODE_ICONS = {
  wall: '<path d="M3 5h18v14H3z M3 9.7h18 M3 14.3h18 M9 5v4.7 M15 5v4.7 M6 9.7v4.6 M12 9.7v4.6 M18 9.7v4.6 M9 14.3V19 M15 14.3V19"/>',
  window: '<path d="M4 3h16v18H4z M12 3v18 M4 12h16"/>',
  pipe: '<path d="M4 7h9a4 4 0 0 1 4 4v9 M4 11h9 M13 11v9 M2 5v8 M15 22h6"/>',
  ear: '<path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-5.5 1.5 M10 9a2 2 0 0 1 4 0"/>',
  wave: '<path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2"/>',
  clap: '<path d="M4 12c3-6 5-6 8 0s5 6 8 0"/>'
};
const modeIcon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${MODE_ICONS[k]}</svg>`;

function renderTests() {
  const list = $("tests-list"), run = $("tests-run");
  if (!list) return;
  if (!wizard.modeId) {
    list.hidden = false; run.hidden = true;
    renderTestsList();
    return;
  }
  list.hidden = true; run.hidden = false;
  renderRunner();
}

function renderTestsList() {
  const cards = $("mode-cards");
  cards.innerHTML = MODE_ORDER.map((id) => {
    const m = MODES[id];
    return `<button class="mode-card" data-mode="${id}">
      <span class="mode-ico">${modeIcon(m.icon)}</span>
      <span class="mode-body"><strong>${esc(m.title)}</strong><span class="small muted">${esc(m.summary)}</span>
      <span class="mode-meta"><span class="tag ${m.devices === 2 ? "tag-two" : ""}">${m.devices === 2 ? "2 telefoni" : "1 telefono"}</span><span class="tag">${m.time}</span><span class="tag">${esc(m.norm)}</span></span></span>
    </button>`;
  }).join("");
  cards.querySelectorAll(".mode-card").forEach((b) => b.addEventListener("click", () => openMode(b.dataset.mode)));
  const g = $("glossary");
  if (!g.childElementCount) {
    g.innerHTML = GLOSSARY.map(([t, d]) => `<details class="gl"><summary>${esc(t)}</summary><p class="small">${esc(d)}</p></details>`).join("");
  }
}

function fieldHTML(f) {
  const val = wizard.ctx.params[f.key];
  if (f.kind === "text") {
    return `<label class="field"><span class="label">${esc(f.label)}</span><input type="text" id="wf-${f.key}" value="${esc(val)}" autocomplete="off"></label>`;
  }
  return `<div class="field"><span class="label">${esc(f.label)}</span><div class="seg seg-wrap" data-field="${f.key}">` +
    f.choices.map(([v, l]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${String(v === val)}">${esc(l)}</button>`).join("") + `</div></div>`;
}

function renderRunner() {
  const mode = MODES[wizard.modeId], s = currentStep(), ctx = wizard.ctx;
  const n = mode.steps.length, i = wizard.step;
  let h = `<div class="run-head"><button class="link" id="w-exit">‹ Tutte le prove</button><span class="small muted">Passo ${i + 1} di ${n}</span></div>`;
  h += `<div class="dots">${mode.steps.map((st, k) => `<span class="dot ${k < i ? "done" : k === i ? "cur" : ""}" title="${esc(st.title)}"></span>`).join("")}</div>`;
  h += `<div><span class="label">${esc(mode.title)}${mode.devices === 2 ? " · questo telefono è B, il misuratore" : ""}</span><h1 class="step-title">${esc(s.title)}</h1></div>`;

  if (s.type === "info") {
    if (s.fields) h += `<div class="panel fields">${s.fields.map(fieldHTML).join("")}</div>`;
    h += `<div class="prose">${s.html(ctx)}</div>`;
    if (s.diagram) h += `<figure class="panel fig">${s.diagram(ctx)}</figure>`;
    if (s.elevation) h += `<figure class="panel fig">${elevationDiagram()}</figure>`;
    if (i === 0) {
      h += `<div class="panel"><h2>Cosa misura questa prova</h2><dl class="params">${mode.params.map(([k, d]) => `<dt class="num">${esc(k)}</dt><dd>${esc(d)}</dd>`).join("")}</dl></div>`;
    }
  } else if (s.type === "measure") {
    h += `<div class="prose">${s.html(ctx)}</div>`;
    h += measureHTML(s);
    h += `<figure class="panel fig">${s.diagram(ctx)}</figure>`;
    h += `<details class="panel gl"><summary>Come tenere il telefono</summary>${elevationDiagram()}</details>`;
  } else if (s.type === "rt60") {
    h += `<div class="prose">${s.html(ctx)}</div>`;
    h += rt60HTML(s);
    h += `<figure class="panel fig">${s.diagram(ctx)}</figure>`;
  } else if (s.type === "result") {
    h += resultHTML(s);
  }

  const ready = stepReady(s);
  const last = i === n - 1;
  h += `<div class="run-nav">`;
  h += i > 0 ? `<button id="w-back">Indietro</button>` : `<span></span>`;
  if (!last) {
    if (s.type === "rt60" && s.optional && !ready) h += `<button id="w-skip">Salta, usa T = 0,5 s</button>`;
    else h += `<button class="primary" id="w-next" ${ready ? "" : "disabled"}>${s.type === "measure" || s.type === "rt60" ? "Avanti" : "Ho fatto, avanti"}</button>`;
  } else {
    h += `<button class="primary" id="w-new">Nuova prova</button>`;
  }
  h += `</div>`;
  $("tests-run").innerHTML = h;
  wireRunner(s);
  if (s.type === "rt60") drawDecay($("w-decay"));
}

function measureHTML(s) {
  const m = wizard.m, val = V(wizard.ctx, s.key);
  const manual = typeof s.manual === "function" ? s.manual(wizard.ctx) : !!s.manual;
  const cur = wizard.ctx.params["dur_" + s.key] || s.duration;
  let h = `<div class="panel measure">`;
  h += `<div class="live"><div><span class="label">Livello ora</span><div class="live-v"><span class="num" id="w-live">${meter.levelFS == null ? "–" : fmt(cal(meter.levelFS))}</span> <span class="muted small">dB(A)</span></div></div>`;
  if (m.phase === "recording") h += `<div class="right"><span class="label">${esc(s.short)} finora</span><div class="live-v"><span class="num" id="w-leq">–</span> <span class="muted small">dB(A)</span></div></div>`;
  h += `</div>`;
  if (m.phase === "idle" || m.phase === "starting") {
    if (!manual) h += `<div class="field"><span class="label">Durata</span><div class="seg seg-wrap" id="w-dur">${s.durations.map((d) => `<button type="button" data-v="${d}" aria-pressed="${String(d === cur)}">${d >= 60 ? d / 60 + " min" : d + " s"}</button>`).join("")}</div></div>`;
    h += `<button class="primary big" id="w-start" ${m.phase === "starting" ? "disabled" : ""}>${m.phase === "starting" ? "Avvio del microfono…" : `Avvia misura ${esc(s.short)}`}</button>`;
    if (m.error) h += `<div class="notice error">${esc(m.error)}</div>`;
  } else if (m.phase === "countdown") {
    h += `<div class="countdown"><span class="num">${m.count}</span><span class="small muted">Mettiti in posizione e resta in silenzio</span></div>`;
    h += `<button id="w-cancel">Annulla</button>`;
  } else if (m.phase === "recording") {
    h += `<div class="progress"><div id="w-progress" style="width:0%"></div></div><div class="small muted num" id="w-time">0:00</div>`;
    h += manual ? `<button class="primary big" id="w-finish">Termina misura</button>` : `<button id="w-cancel">Annulla</button>`;
  } else if (m.phase === "done" && val) {
    h += `<div class="result-mini"><div><span class="label">LAeq</span><strong class="num">${fmt(val.leqA)}</strong></div><div><span class="label">LAFmax</span><strong class="num">${fmt(val.lafmax)}</strong></div><div><span class="label">LASmax</span><strong class="num">${fmt(val.lasmax)}</strong></div><div><span class="label">Durata</span><strong class="num">${fmtDur(val.duration)}</strong></div></div>`;
    if (m.warning) h += `<div class="notice">${esc(m.warning)}</div>`;
    h += `<button id="w-redo">Ripeti misura</button>`;
  }
  return h + `</div>`;
}

function rt60HTML(s) {
  const st = reverb.state;
  const titles = { idle: "Pronto", calibrating: "Misuro il rumore di fondo…", armed: "Batti le mani ora!", recording: "Registro il decadimento…", done: "RT60 ≈ " + fmt(reverb.rt, 2) + " s", failed: "Prova non riuscita" };
  const details = { idle: "Premi «Avvia prova» e resta in silenzio per un secondo.", calibrating: "Resta in silenzio.", armed: "Un solo battito, forte e secco.", recording: "Non fare rumore per 3 secondi.", done: reverb.method + ". Puoi fare un'altra prova per una media più affidabile.", failed: reverb.message };
  let h = `<div class="panel rt-box">`;
  h += `<div class="status ${st}"><div class="icon">${STATUS_ICONS[st]}</div><div style="min-width:0"><h2>${esc(titles[st])}</h2><p class="small muted">${esc(details[st])}</p></div></div>`;
  h += `<button class="${reverb.isActive() ? "" : "primary"} big" id="w-rt">${reverb.isActive() ? "Annulla" : reverb.results.length ? "Nuova prova" : "Avvia prova"}</button>`;
  if (reverb.decay.length) h += `<canvas class="chart" id="w-decay" style="height:150px"></canvas><p class="small muted">Grigio: livello misurato. Colore: curva di Schroeder da cui si ricava T.</p>`;
  if (reverb.results.length) {
    h += `<div class="rows">${reverb.results.map((v, k) => `<div class="row"><span>Prova ${k + 1}</span><span class="num">${fmt(v, 2)} s <button class="del" data-del="${k}" aria-label="Elimina prova ${k + 1}">×</button></span></div>`).join("")}`;
    h += `<div class="row"><strong>Media</strong><strong class="num">${fmt(reverb.average(), 2)} s</strong></div></div>`;
  }
  return h + `</div>`;
}

function resultHTML(s) {
  const r = s.compute(wizard.ctx);
  wizard.lastResult = r;
  let h = `<div class="panel verdict-card tone-${r.verdict.tone}"><div class="verdict-head"><span class="label">${esc(r.headline[0])}</span><span class="big-num num">${r.headline[1]}<small> ${r.headline[2]}</small></span></div>`;
  h += `<h2>${esc(r.verdict.title)}</h2><p class="small">${esc(r.verdict.text)}</p></div>`;
  h += `<figure class="panel fig"><span class="label">Confronto con le soglie</span>${r.chart}</figure>`;
  h += `<div class="panel"><h2>Valori misurati</h2><div class="rows">${r.rows.map(([k, v]) => `<div class="row"><span>${esc(k)}</span><span class="num">${esc(v)}</span></div>`).join("")}</div></div>`;
  if (r.notes.length) h += `<div class="panel"><h2>Note</h2><ul class="tips small">${r.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>`;
  h += wizard.saved
    ? `<div class="notice ok">Risultato salvato in «${esc(r.room)}». Lo trovi nella scheda Risultati.</div>`
    : `<button class="primary big" id="w-save">Salva nei risultati</button>`;
  return h;
}

function wireRunner(s) {
  const on = (id, f) => { const el = $(id); if (el) el.addEventListener("click", f); };
  on("w-exit", closeMode);
  on("w-back", () => goStep(-1));
  on("w-next", () => goStep(1));
  on("w-skip", () => { wizard.ctx.values[s.key] = undefined; leaveStep(); wizard.step++; enterStep(); });
  on("w-new", () => openMode(wizard.modeId));
  on("w-start", startStepMeasure);
  on("w-cancel", cancelStepMeasure);
  on("w-finish", () => capture.finish());
  on("w-redo", () => { wizard.ctx.values[s.key] = undefined; wizard.m = { phase: "idle" }; renderTests(); });
  on("w-save", () => {
    addMeasurement(wizard.lastResult.save);
    wizard.saved = true;
    renderTests();
  });
  on("w-rt", async () => {
    if (reverb.isActive()) { reverb.cancel(); return; }
    if (!meter.running && !(await startMeter())) { reverb.fail(meter.error || "Il microfono non è attivo."); return; }
    reverb.arm();
  });
  document.querySelectorAll("#tests-run [data-del]").forEach((b) => b.addEventListener("click", () => reverb.removeTrial(Number(b.dataset.del))));
  document.querySelectorAll("#tests-run [data-field]").forEach((g) => {
    g.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      wizard.ctx.params[g.dataset.field] = b.dataset.v;
      renderTests();
    }));
  });
  document.querySelectorAll("#tests-run input[id^='wf-']").forEach((inp) => {
    inp.addEventListener("input", () => { wizard.ctx.params[inp.id.slice(3)] = inp.value.trim() || inp.placeholder || "Stanza"; });
    inp.addEventListener("change", () => renderTests());
  });
  const dur = $("w-dur");
  if (dur) dur.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    wizard.ctx.params["dur_" + s.key] = Number(b.dataset.v);
    renderTests();
  }));
}
