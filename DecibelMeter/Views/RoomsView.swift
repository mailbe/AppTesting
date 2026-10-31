import SwiftUI

struct RoomsView: View {
    @EnvironmentObject private var store: MeasurementStore
    @State private var confirmingDeleteAll = false

    var body: some View {
        NavigationStack {
            Group {
                if store.items.isEmpty {
                    ContentUnavailableView(
                        "Nessuna misura salvata",
                        systemImage: "house",
                        description: Text("Salva una misura di rumore o di riverbero indicando la stanza: qui potrai confrontare tutti gli ambienti della casa.")
                    )
                } else {
                    list
                }
            }
            .navigationTitle("Stanze")
            .toolbar {
                if !store.items.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        ShareLink(
                            item: store.csv(),
                            subject: Text("Misure acustiche"),
                            preview: SharePreview("Misure acustiche (CSV)")
                        )
                    }
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Elimina tutto", role: .destructive) {
                            confirmingDeleteAll = true
                        }
                    }
                }
            }
            .confirmationDialog("Eliminare tutte le misure?", isPresented: $confirmingDeleteAll, titleVisibility: .visible) {
                Button("Elimina tutto", role: .destructive) { store.deleteAll() }
            }
        }
    }

    private var list: some View {
        List {
            ForEach(store.rooms, id: \.self) { room in
                Section {
                    RoomSummary(measurements: store.measurements(in: room))
                    ForEach(store.measurements(in: room)) { measurement in
                        MeasurementRow(measurement: measurement)
                            .swipeActions {
                                Button("Elimina", role: .destructive) {
                                    store.delete(measurement)
                                }
                            }
                    }
                } header: {
                    Text(room)
                }
            }
        }
    }
}

private struct RoomSummary: View {
    let measurements: [RoomMeasurement]

    private var leqAverage: Double? {
        energyAverage(measurements.compactMap(\.leq))
    }

    private var rt60Average: Double? {
        let values = measurements.compactMap(\.rt60)
        guard !values.isEmpty else { return nil }
        return values.reduce(0, +) / Double(values.count)
    }

    var body: some View {
        HStack(spacing: 10) {
            StatTile(title: "Rumore medio", value: leqAverage.formatted(), unit: "dB")
            StatTile(title: "RT60 medio", value: rt60Average.formatted(decimals: 2), unit: "s")
        }
        .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))
    }

    /// Media energetica (logaritmica) dei livelli in dB
    private func energyAverage(_ levels: [Double]) -> Double? {
        guard !levels.isEmpty else { return nil }
        let energy = levels.map { pow(10, $0 / 10) }.reduce(0, +) / Double(levels.count)
        return 10 * log10(energy)
    }
}

private struct MeasurementRow: View {
    let measurement: RoomMeasurement

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Image(systemName: measurement.rt60 != nil ? "hands.clap" : "waveform")
                    .foregroundStyle(Color.accentColor)
                Text(measurement.date, format: .dateTime.day().month().hour().minute())
                    .font(.subheadline)
                Spacer()
                if let rt60 = measurement.rt60 {
                    Text(String(format: "RT60 %.2f s", rt60))
                        .font(.subheadline.weight(.semibold).monospacedDigit())
                } else if let leq = measurement.leq {
                    Text(String(format: "Leq %.1f %@", leq, measurement.weighting?.unit ?? "dB"))
                        .font(.subheadline.weight(.semibold).monospacedDigit())
                        .foregroundStyle(levelColor(leq))
                }
            }
            if measurement.leq != nil {
                Text("Min \(measurement.minLevel.formatted()) · Max \(measurement.maxLevel.formatted()) · Picco \(measurement.peak.formatted()) · \(formatDuration(measurement.duration ?? 0))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
