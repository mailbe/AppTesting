import Charts
import SwiftUI

struct ReverbView: View {
    @EnvironmentObject private var meter: SoundLevelMeter
    @EnvironmentObject private var reverb: ReverbAnalyzer
    @EnvironmentObject private var store: MeasurementStore

    @State private var showingSave = false
    @State private var roomName = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    instructions
                    statusCard
                    actionButton

                    if !reverb.decay.isEmpty {
                        decayChart
                    }

                    if !reverb.results.isEmpty {
                        resultsCard
                    }

                    referenceTable
                }
                .padding()
            }
            .navigationTitle("Riverbero (RT60)")
            .alert("Salva RT60", isPresented: $showingSave) {
                TextField("Nome stanza (es. Soggiorno)", text: $roomName)
                Button("Salva", action: save)
                Button("Annulla", role: .cancel) {}
            } message: {
                Text("Media di \(reverb.results.count) prove: \(reverb.average.formatted(decimals: 2)) s")
            }
        }
    }

    private var instructions: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Come funziona")
                .font(.headline)
            Text("Il tempo di riverberazione indica quanti secondi impiega il suono a calare di 60 dB. Mettiti al centro della stanza, chiedi silenzio, premi «Avvia test» e quando richiesto batti le mani una volta, forte e secco. Ripeti 3–5 volte in punti diversi per una media affidabile.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private var statusCard: some View {
        HStack(spacing: 14) {
            statusIcon
                .font(.system(size: 34))
                .frame(width: 44)
            VStack(alignment: .leading, spacing: 4) {
                Text(statusTitle)
                    .font(.headline)
                if let detail = statusDetail {
                    Text(detail)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder
    private var statusIcon: some View {
        switch reverb.state {
        case .idle:
            Image(systemName: "hands.clap").foregroundStyle(.secondary)
        case .calibrating:
            ProgressView()
        case .armed:
            Image(systemName: "hands.clap.fill").foregroundStyle(Color.accentColor)
                .symbolEffect(.pulse)
        case .recording:
            Image(systemName: "waveform").foregroundStyle(.orange)
                .symbolEffect(.variableColor)
        case .done:
            Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
        case .failed:
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
        }
    }

    private var statusTitle: String {
        switch reverb.state {
        case .idle: return "Pronto"
        case .calibrating: return "Misuro il rumore di fondo…"
        case .armed: return "Batti le mani ora!"
        case .recording: return "Registro il decadimento…"
        case .done(let rt): return String(format: "RT60 ≈ %.2f s", rt)
        case .failed: return "Misura non riuscita"
        }
    }

    private var statusDetail: String? {
        switch reverb.state {
        case .idle: return "Premi «Avvia test» e resta in silenzio per un secondo."
        case .calibrating: return "Resta in silenzio."
        case .armed: return "Un solo battito, forte e secco."
        case .recording: return "Non fare rumore per 3 secondi."
        case .done(let rt):
            return [reverb.method.map { "Metodo \($0)." }, ReverbAnalyzer.interpretation(for: rt)]
                .compactMap { $0 }
                .joined(separator: " ")
        case .failed(let message): return message
        }
    }

    private var actionButton: some View {
        Button {
            if reverb.isActive {
                reverb.cancel()
            } else {
                if !meter.isRunning { meter.start() }
                reverb.arm()
            }
        } label: {
            Label(reverb.isActive ? "Annulla" : "Avvia test",
                  systemImage: reverb.isActive ? "xmark" : "play.fill")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .tint(reverb.isActive ? .gray : .accentColor)
        .controlSize(.large)
    }

    private var decayChart: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Curva di decadimento (ultima prova)")
                .font(.caption)
                .foregroundStyle(.secondary)
            Chart {
                ForEach(reverb.decay) { point in
                    LineMark(
                        x: .value("Tempo", point.time),
                        y: .value("dB", point.level),
                        series: .value("Curva", "Livello")
                    )
                    .foregroundStyle(by: .value("Curva", "Livello"))
                }
                ForEach(reverb.schroeder) { point in
                    LineMark(
                        x: .value("Tempo", point.time),
                        y: .value("dB", point.level),
                        series: .value("Curva", "Schroeder")
                    )
                    .foregroundStyle(by: .value("Curva", "Schroeder"))
                }
                RuleMark(y: .value("dB", -60))
                    .foregroundStyle(.secondary.opacity(0.4))
                    .lineStyle(StrokeStyle(dash: [4, 4]))
            }
            .chartForegroundStyleScale(["Livello": Color.gray, "Schroeder": Color.accentColor])
            .chartYScale(domain: -70...5)
            .chartXAxisLabel("secondi")
            .frame(height: 180)
        }
        .padding(12)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    private var resultsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Prove")
                    .font(.headline)
                Spacer()
                Button("Azzera", role: .destructive) { reverb.clearResults() }
                    .font(.subheadline)
            }

            ForEach(Array(reverb.results.enumerated()), id: \.offset) { index, value in
                HStack {
                    Text("Prova \(index + 1)")
                    Spacer()
                    Text(String(format: "%.2f s", value))
                        .monospacedDigit()
                }
                .font(.subheadline)
            }

            Divider()

            if let average = reverb.average {
                HStack {
                    Text("Media")
                        .font(.headline)
                    Spacer()
                    Text(String(format: "%.2f s", average))
                        .font(.headline.monospacedDigit())
                }
                Text(ReverbAnalyzer.interpretation(for: average))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Button {
                showingSave = true
            } label: {
                Label("Salva per una stanza", systemImage: "square.and.arrow.down")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
        }
        .padding(12)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    private var referenceTable: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Valori di riferimento")
                .font(.headline)
            referenceRow("Camera da letto", "0,3 – 0,5 s")
            referenceRow("Soggiorno", "0,4 – 0,6 s")
            referenceRow("Studio / home office", "0,3 – 0,5 s")
            referenceRow("Cucina / bagno", "0,5 – 0,8 s")
            referenceRow("Stanza vuota", "1,0 – 2,0 s")
            Text("Valori indicativi. Il microfono dell'iPhone non è uno strumento certificato: usa i risultati per confrontare le stanze tra loro o prima/dopo un intervento.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.top, 4)
        }
    }

    private func referenceRow(_ room: String, _ value: String) -> some View {
        HStack {
            Text(room)
            Spacer()
            Text(value).foregroundStyle(.secondary)
        }
        .font(.subheadline)
    }

    private func save() {
        guard let average = reverb.average else { return }
        let name = roomName.trimmingCharacters(in: .whitespacesAndNewlines)
        store.add(RoomMeasurement(room: name.isEmpty ? "Senza nome" : name, date: Date(), rt60: average))
        reverb.clearResults()
    }
}
