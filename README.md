# Fonometro – misura l'acustica di casa con l'iPhone

App iOS nativa (SwiftUI) per valutare rumore e acustica delle stanze di casa.

## Funzioni

- **Misura** – fonometro in tempo reale in dB(A) o dB(Z), con risposta Fast/Slow,
  minimo, massimo, **Leq** (livello equivalente), picco e grafico degli ultimi 60 s.
  Usa la modalità audio *measurement* di iOS (niente controllo automatico del guadagno).
- **Riverbero (RT60)** – batti le mani al centro della stanza: l'app misura il
  rumore di fondo, rileva l'impulso e stima il tempo di riverberazione con
  integrazione di Schroeder (T20, o T10 se la dinamica è bassa). Fai più prove
  e salva la media.
- **Stanze** – archivio delle misure per stanza con medie di rumore e RT60;
  esportazione CSV tramite il menu Condividi.
- **Impostazioni** – ponderazione, calibrazione dell'offset del microfono,
  consigli di misura e valori di riferimento.

## Installazione sul tuo iPhone

Servono un Mac con **Xcode 16** (o successivo) e un iPhone con **iOS 17+**.

1. Clona il repository e apri `DecibelMeter.xcodeproj` con Xcode.
2. Seleziona il target **DecibelMeter** › *Signing & Capabilities* e scegli il tuo
   *Team* (va bene l'Apple ID gratuito). Se l'identificatore
   `com.apptesting.fonometro` risulta già in uso, cambialo (es. `com.tuonome.fonometro`).
3. Collega l'iPhone, selezionalo come destinazione e premi **Run** (⌘R).
4. Sull'iPhone, la prima volta: *Impostazioni › Generali › VPN e gestione dispositivi*
   › autorizza il tuo profilo sviluppatore. Su iOS 16+ attiva anche la
   *Modalità sviluppatore* (Impostazioni › Privacy e sicurezza).

Nel simulatore il microfono non è affidabile: prova l'app su un dispositivo reale.

## Calibrazione

Il valore in dB SPL è stimato come `dBFS + offset` (predefinito 110 dB). Per valori
assoluti più accurati, metti l'iPhone accanto a un fonometro di riferimento con un
rumore costante e regola l'offset in *Impostazioni › Calibrazione*. Anche senza
calibrazione, i confronti tra stanze restano validi.

## Come misurare l'acustica di casa

1. **Rumore di fondo**: porte e finestre chiuse, iPhone a ~1,2 m da terra, misura
   2 minuti per stanza e salva il Leq. Ripeti di notte e nelle ore di punta.
2. **Riverbero**: 3–5 battiti di mani in punti diversi di ogni stanza; confronta
   la media con i valori di riferimento (0,4–0,6 s per un soggiorno).
3. Confronta le stanze nella scheda **Stanze** o esporta il CSV.

> Lo smartphone non sostituisce un fonometro certificato di classe 1/2: i valori
> sono indicativi, specie sotto i 30 dB e alle basse frequenze.

## Struttura

```
DecibelMeter/
  DecibelMeterApp.swift       entry point
  Audio/
    AWeightingFilter.swift    filtro di ponderazione A (IEC 61672, biquad)
    LevelProcessor.swift      elaborazione dei buffer del microfono
    SoundLevelMeter.swift     motore audio, statistiche, calibrazione
    ReverbAnalyzer.swift      stima RT60 (Schroeder + regressione)
  Models/
    MeasurementStore.swift    misure salvate per stanza
  Views/                      interfaccia SwiftUI
```
