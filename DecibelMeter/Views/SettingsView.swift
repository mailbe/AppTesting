import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var meter: SoundLevelMeter

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Ponderazione", selection: $meter.weighting) {
                        ForEach(FrequencyWeighting.allCases) { weighting in
                            Text(weighting.description).tag(weighting)
                        }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                } header: {
                    Text("Ponderazione in frequenza")
                } footer: {
                    Text("La curva A attenua basse e altissime frequenze come fa l'orecchio: è lo standard per valutare il rumore negli ambienti abitativi.")
                }

                Section("Ponderazione temporale") {
                    Picker("Risposta", selection: $meter.timeWeighting) {
                        ForEach(TimeWeighting.allCases) { weighting in
                            Text(weighting.label).tag(weighting)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                Section {
                    Stepper(value: $meter.calibrationOffset, in: 60...150, step: 0.5) {
                        HStack {
                            Text("Offset")
                            Spacer()
                            Text(String(format: "%.1f dB", meter.calibrationOffset))
                                .monospacedDigit()
                                .foregroundStyle(.secondary)
                        }
                    }
                    HStack {
                        Text("Livello attuale")
                        Spacer()
                        Text("\(meter.level.formatted()) \(meter.weighting.unit)")
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }
                    Button("Ripristina valore predefinito") {
                        meter.calibrationOffset = SoundLevelMeter.defaultCalibrationOffset
                    }
                } header: {
                    Text("Calibrazione")
                } footer: {
                    Text("Ogni iPhone ha una sensibilità del microfono leggermente diversa. Per valori assoluti più precisi, avvia la misura accanto a un fonometro di riferimento (o un'app calibrata) con una sorgente di rumore costante e regola l'offset finché i due valori coincidono.")
                }

                Section("Consigli per misurare") {
                    tip("iphone", "Tieni l'iPhone a 1–1,5 m da terra, lontano da pareti e dal corpo, con il microfono libero (niente cover spesse).")
                    tip("door.left.hand.closed", "Per il rumore di fondo chiudi porte e finestre e misura almeno 1–2 minuti: confronta il Leq tra stanze diverse.")
                    tip("moon.zzz", "Misura di notte e in orari di punta per capire l'isolamento da traffico e vicini.")
                    tip("hands.clap", "Per il riverbero fai più prove in punti diversi e usa la media.")
                }

                Section("Riferimenti (OMS / normativa)") {
                    reference("Camera da letto di notte", "≤ 30 dB(A)")
                    reference("Soggiorno di giorno", "≤ 35–40 dB(A)")
                    reference("Conversazione normale", "≈ 60 dB(A)")
                    reference("Rischio uditivo (8 h)", "≥ 85 dB(A)")
                }

                Section {
                    Text("Le misure sono stime: il microfono di uno smartphone non sostituisce un fonometro di classe 1/2, soprattutto sotto i 30 dB e alle basse frequenze.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Impostazioni")
        }
    }

    private func tip(_ icon: String, _ text: String) -> some View {
        Label {
            Text(text).font(.subheadline)
        } icon: {
            Image(systemName: icon).foregroundStyle(Color.accentColor)
        }
    }

    private func reference(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
            Spacer()
            Text(value).foregroundStyle(.secondary)
        }
    }
}
