import Charts
import SwiftUI

struct MeterView: View {
    @EnvironmentObject private var meter: SoundLevelMeter
    @EnvironmentObject private var store: MeasurementStore

    @State private var showingSave = false
    @State private var roomName = ""
    @State private var savedConfirmation = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    LevelGauge(level: meter.level, unit: meter.weighting.unit)
                        .frame(width: 260, height: 260)
                        .padding(.top, 8)

                    Text(meter.level.map(NoiseLevel.description(for:)) ?? "Premi Avvia per iniziare a misurare")
                        .font(.headline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)

                    statsGrid

                    historyChart

                    controls

                    if meter.permissionDenied {
                        permissionWarning
                    }
                    if let error = meter.errorMessage {
                        Text(error)
                            .foregroundStyle(.red)
                            .font(.footnote)
                    }
                }
                .padding()
            }
            .navigationTitle("Fonometro")
            .alert("Salva misura", isPresented: $showingSave) {
                TextField("Nome stanza (es. Soggiorno)", text: $roomName)
                Button("Salva", action: save)
                Button("Annulla", role: .cancel) {}
            } message: {
                Text("Leq \(meter.leq.formatted()) \(meter.weighting.unit) su \(formatDuration(meter.elapsed))")
            }
            .overlay(alignment: .bottom) {
                if savedConfirmation {
                    Label("Misura salvata", systemImage: "checkmark.circle.fill")
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(.thinMaterial, in: Capsule())
                        .padding(.bottom, 12)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
        }
    }

    private var statsGrid: some View {
        let unit = meter.weighting.unit
        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            StatTile(title: "Min", value: meter.minLevel.formatted(), unit: unit)
            StatTile(title: "Max", value: meter.maxLevel.formatted(), unit: unit)
            StatTile(title: "Leq", value: meter.leq.formatted(), unit: unit)
            StatTile(title: "Picco", value: meter.peak.formatted(), unit: "dB")
            StatTile(title: "Durata", value: formatDuration(meter.elapsed))
            StatTile(title: "Tempo", value: meter.timeWeighting == .fast ? "Fast" : "Slow")
        }
    }

    private var historyChart: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Ultimi 60 secondi")
                .font(.caption)
                .foregroundStyle(.secondary)
            Chart(meter.history) { sample in
                LineMark(
                    x: .value("Tempo", sample.time),
                    y: .value("dB", sample.levelFS + meter.calibrationOffset)
                )
                .interpolationMethod(.monotone)
                .foregroundStyle(Color.accentColor)
            }
            .chartYScale(domain: 20...120)
            .chartXScale(domain: max(0, meter.elapsed - SoundLevelMeter.historyWindow)...max(meter.elapsed, 10))
            .chartXAxis {
                AxisMarks { value in
                    AxisGridLine()
                    AxisValueLabel {
                        if let seconds = value.as(Double.self) {
                            Text("\(Int(seconds))s")
                        }
                    }
                }
            }
            .frame(height: 160)
        }
        .padding(12)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    private var controls: some View {
        HStack(spacing: 12) {
            Button {
                meter.isRunning ? meter.stop() : meter.start()
            } label: {
                Label(meter.isRunning ? "Stop" : "Avvia", systemImage: meter.isRunning ? "stop.fill" : "mic.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(meter.isRunning ? .red : .accentColor)

            Button {
                meter.reset()
            } label: {
                Label("Azzera", systemImage: "arrow.counterclockwise")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)

            Button {
                showingSave = true
            } label: {
                Label("Salva", systemImage: "square.and.arrow.down")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .disabled(meter.leq == nil)
        }
        .controlSize(.large)
    }

    private var permissionWarning: some View {
        VStack(spacing: 8) {
            Text("Accesso al microfono negato")
                .font(.headline)
            Text("Per misurare i decibel abilita il microfono in Impostazioni › Privacy › Microfono.")
                .font(.footnote)
                .multilineTextAlignment(.center)
            Button("Apri Impostazioni") {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(Color.red.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
    }

    private func save() {
        let name = roomName.trimmingCharacters(in: .whitespacesAndNewlines)
        store.add(RoomMeasurement(
            room: name.isEmpty ? "Senza nome" : name,
            date: Date(),
            weighting: meter.weighting,
            leq: meter.leq,
            minLevel: meter.minLevel,
            maxLevel: meter.maxLevel,
            peak: meter.peak,
            duration: meter.elapsed
        ))
        withAnimation { savedConfirmation = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            withAnimation { savedConfirmation = false }
        }
    }
}

struct LevelGauge: View {
    let level: Double?
    let unit: String

    private let range = 20.0...120.0
    private let arc = 0.75

    private var fraction: Double {
        guard let level else { return 0 }
        return min(max((level - range.lowerBound) / (range.upperBound - range.lowerBound), 0), 1)
    }

    var body: some View {
        ZStack {
            Circle()
                .trim(from: 0, to: arc)
                .stroke(Color(.systemGray5), style: StrokeStyle(lineWidth: 22, lineCap: .round))
                .rotationEffect(.degrees(135))

            Circle()
                .trim(from: 0, to: arc * fraction)
                .stroke(
                    AngularGradient(
                        colors: [.green, .yellow, .orange, .red],
                        center: .center,
                        startAngle: .degrees(0),
                        endAngle: .degrees(360 * arc)
                    ),
                    style: StrokeStyle(lineWidth: 22, lineCap: .round)
                )
                .rotationEffect(.degrees(135))
                .animation(.easeOut(duration: 0.15), value: fraction)

            VStack(spacing: 0) {
                Text(level.map { String(Int($0.rounded())) } ?? "–")
                    .font(.system(size: 72, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundStyle(level.map(levelColor) ?? .secondary)
                    .contentTransition(.numericText())
                Text(unit)
                    .font(.title3.weight(.medium))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(11)
    }
}
