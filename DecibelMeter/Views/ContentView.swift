import SwiftUI

struct ContentView: View {
    var body: some View {
        TabView {
            MeterView()
                .tabItem { Label("Misura", systemImage: "waveform") }
            ReverbView()
                .tabItem { Label("Riverbero", systemImage: "hands.clap") }
            RoomsView()
                .tabItem { Label("Stanze", systemImage: "house") }
            SettingsView()
                .tabItem { Label("Impostazioni", systemImage: "gearshape") }
        }
    }
}

/// Riquadro con titolo e valore usato nelle varie schermate
struct StatTile: View {
    let title: String
    let value: String
    var unit: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(value)
                    .font(.title3.weight(.semibold).monospacedDigit())
                if !unit.isEmpty {
                    Text(unit)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

extension Optional where Wrapped == Double {
    func formatted(decimals: Int = 1) -> String {
        guard let value = self else { return "–" }
        return String(format: "%.\(decimals)f", value)
    }
}

func formatDuration(_ seconds: Double) -> String {
    let total = Int(seconds)
    return String(format: "%d:%02d", total / 60, total % 60)
}

func levelColor(_ db: Double) -> Color {
    switch db {
    case ..<45: return .green
    case ..<65: return .yellow
    case ..<80: return .orange
    default: return .red
    }
}
