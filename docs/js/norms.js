"use strict";

// Soglie di riferimento. Valori di legge: DPCM 5/12/1997 (requisiti acustici passivi, categoria A – residenze)
// e DPCM 14/11/1997 (criterio differenziale). Classi: UNI 11367. Linee guida: OMS (Guidelines for Community Noise).
const NORMS = {
  // Isolamento tra unità immobiliari diverse: R'w ≥ 50 dB
  units: {
    limit: 50, label: "R'w ≥ 50 dB", source: "DPCM 5/12/1997",
    classes: [["I", 56], ["II", 53], ["III", 50], ["IV", 45]]
  },
  // Pareti interne alla stessa abitazione: nessun limite di legge, riferimento di comfort
  internal: { good: 45, fair: 35 },
  // Isolamento di facciata: D2m,nT,w ≥ 40 dB
  facade: {
    limit: 40, label: "D2m,nT,w ≥ 40 dB", source: "DPCM 5/12/1997",
    classes: [["I", 43], ["II", 40], ["III", 37], ["IV", 32]]
  },
  // Impianti a funzionamento continuo: LAeq ≤ 25 dB(A)
  impCont: {
    limit: 25, label: "LAeq ≤ 25 dB(A)", source: "DPCM 5/12/1997",
    classes: [["I", 25], ["II", 28], ["III", 32], ["IV", 37]]
  },
  // Impianti a funzionamento discontinuo: LASmax ≤ 35 dB(A)
  impDisc: {
    limit: 35, label: "LASmax ≤ 35 dB(A)", source: "DPCM 5/12/1997",
    classes: [["I", 30], ["II", 33], ["III", 37], ["IV", 42]]
  },
  // Criterio differenziale
  differential: {
    limit: { day: 5, night: 3 },
    // Sotto queste soglie di rumore ambientale il criterio non si applica (rumore trascurabile)
    applicability: { open: { day: 50, night: 40 }, closed: { day: 35, night: 25 } },
    source: "DPCM 14/11/1997, art. 4"
  },
  // Linee guida OMS per gli ambienti interni
  oms: { night: 30, nightMax: 45, day: 35 }
};

// Soglie selezionabili nel grafico del fonometro
const REFERENCES = [
  { id: "none", label: "Nessuna soglia" },
  { id: "night", label: "Camera di notte · 30 dB(A)", v: 30, short: "OMS notte 30", src: "linee guida OMS" },
  { id: "day", label: "Soggiorno di giorno · 35 dB(A)", v: 35, short: "OMS giorno 35", src: "linee guida OMS" },
  { id: "impC", label: "Impianti continui · 25 dB(A)", v: 25, short: "Impianti 25", src: "DPCM 5/12/1997" },
  { id: "impD", label: "Impianti discontinui · 35 dB(A)", v: 35, short: "Impianti max 35", src: "DPCM 5/12/1997" },
  { id: "hear", label: "Rischio uditivo · 85 dB(A)", v: 85, short: "Udito 85", src: "D.Lgs. 81/2008" }
];
const refById = (id) => REFERENCES.find((r) => r.id === id) || REFERENCES[0];

// Riverbero consigliato per tipo di stanza (comfort, nessun limite di legge per le abitazioni)
const ROOM_TYPES = {
  camera: { label: "Camera da letto", rt: [0.3, 0.5], noise: 30, noiseMax: 45, noiseLabel: "OMS, notte" },
  soggiorno: { label: "Soggiorno", rt: [0.4, 0.6], noise: 35, noiseLabel: "OMS, giorno" },
  studio: { label: "Studio / home office", rt: [0.3, 0.5], noise: 35, noiseLabel: "OMS, giorno" },
  cucina: { label: "Cucina / bagno", rt: [0.5, 0.8], noise: 35, noiseLabel: "OMS, giorno" }
};

// Classe UNI 11367 per un valore: higher=true se valori più alti sono migliori
function uniClass(value, classes, higher = true) {
  for (const [c, v] of classes) if (higher ? value >= v : value <= v) return c;
  return "fuori classe";
}

// Bande colorate per i grafici a scala, a partire dalle classi
function classBands(classes, min, max, higher = true) {
  const tones = ["good", "good2", "ok", "warn"];
  const bands = [];
  if (higher) {
    let top = max;
    classes.forEach(([c, v], i) => { bands.push({ from: v, to: top, tone: tones[i], label: c }); top = v; });
    bands.push({ from: min, to: top, tone: "bad", label: "" });
  } else {
    let bottom = min;
    classes.forEach(([c, v], i) => { bands.push({ from: bottom, to: v, tone: tones[i], label: c }); bottom = v; });
    bands.push({ from: bottom, to: max, tone: "bad", label: "" });
  }
  return bands;
}

// Correzione per il rumore di fondo (UNI EN ISO 16283-1)
function backgroundCorrect(L, B) {
  if (B == null) return { value: L, note: "Rumore di fondo non misurato: nessuna correzione applicata.", limit: false };
  const d = L - B;
  if (d >= 10) return { value: L, note: null, limit: false };
  if (d >= 6) return { value: 10 * Math.log10(Math.pow(10, L / 10) - Math.pow(10, B / 10)), note: `Livello corretto per il rumore di fondo (differenza ${fmt(d)} dB).`, limit: false };
  return { value: L - 1.3, note: `Il segnale supera il rumore di fondo di soli ${fmt(d)} dB: è stata applicata la correzione massima di 1,3 dB e il risultato è un valore limite.`, limit: true };
}

// Glossario dei parametri mostrato nella scheda Prove
const GLOSSARY = [
  ["dB(A) e dB(Z)", "Il decibel misura il livello sonoro su scala logarittima: +3 dB è il doppio dell'energia, +10 dB è percepito circa come il doppio del volume. La ponderazione A attenua basse e altissime frequenze come fa l'orecchio ed è quella usata dalla normativa per gli ambienti abitativi; la Z è lineare, senza filtro."],
  ["LAeq – livello equivalente", "Il livello costante che avrebbe la stessa energia del rumore misurato nel tempo. È la media energetica: il valore più adatto per confrontare stanze, orari e situazioni."],
  ["LAFmax e LASmax", "Il livello massimo raggiunto durante la misura, con risposta Fast (125 ms) o Slow (1 s). La legge usa LASmax per gli impianti a funzionamento discontinuo, come scarichi e ascensori."],
  ["Rumore di fondo (B)", "Il livello presente quando la sorgente di prova è spenta. Serve per correggere le misure: se il suono di prova lo supera di meno di 10 dB va corretto, sotto i 6 dB la misura diventa un valore limite."],
  ["L1 e L2", "Nelle prove di isolamento, L1 è il livello nella stanza dove c'è l'emettitore e L2 quello nella stanza accanto (ricevente). Si misurano muovendo lentamente il telefono per mediare le differenze tra punto e punto."],
  ["D – differenza di livello", "D = L1 − L2. Quanto si riduce il suono passando da una stanza all'altra. Dipende dalla parete, ma anche dalle porte, dai solai e dalle canalizzazioni (trasmissione laterale)."],
  ["T – tempo di riverberazione (RT60)", "Il tempo in secondi in cui il suono cala di 60 dB dopo che la sorgente si ferma. Una stanza vuota e dura riverbera molto; tappeti, tende e mobili lo riducono."],
  ["DnT – isolamento normalizzato", "DnT = D + 10·log(T / 0,5). Riporta la differenza di livello a una stanza ricevente con riverbero di riferimento di 0,5 s, così le misure in stanze diverse sono confrontabili."],
  ["R'w – potere fonoisolante apparente", "L'indice di legge per le pareti e i solai tra unità immobiliari diverse: per le abitazioni deve essere almeno 50 dB (DPCM 5/12/1997). Si ricava da misure per bande di frequenza con strumenti di classe 1: il valore dell'app ne è una stima indicativa a banda larga."],
  ["D2m,nT,w – isolamento di facciata", "L'isolamento dai rumori esterni misurato a 2 m davanti alla facciata. Per le abitazioni deve essere almeno 40 dB (DPCM 5/12/1997)."],
  ["L'n,w – rumore di calpestio", "Il rumore da calpestio trasmesso dal solaio, misurato con una macchina normalizzata a martelletti: per le abitazioni deve essere al massimo 63 dB. Non si può misurare con un telefono."],
  ["Classi acustiche UNI 11367", "La norma UNI 11367 classifica le unità immobiliari dalla classe I (prestazioni ottime) alla IV (di base). Nei grafici delle prove le bande colorate indicano le classi."],
  ["Criterio differenziale", "Per i rumori di vicini, locali e impianti esterni: la differenza tra rumore ambientale (sorgente accesa) e residuo (sorgente spenta) non deve superare 5 dB(A) di giorno (6–22) e 3 dB(A) di notte (22–6). Non si applica se il rumore ambientale è trascurabile (DPCM 14/11/1997)."],
  ["Valore legale delle misure", "Le misure di questa app sono indicative. Per contestazioni, collaudi o vendite servono un tecnico competente in acustica (iscritto all'elenco ENTECA), strumenti certificati di classe 1 e le procedure delle norme UNI EN ISO 16283 e UNI 11367."]
];
