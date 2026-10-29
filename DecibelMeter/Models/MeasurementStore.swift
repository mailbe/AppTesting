import Foundation

struct RoomMeasurement: Identifiable, Codable, Equatable {
    var id = UUID()
    var room: String
    var date: Date
    var weighting: FrequencyWeighting?
    var leq: Double?
    var minLevel: Double?
    var maxLevel: Double?
    var peak: Double?
    var duration: Double?
    var rt60: Double?
}

/// Archivio delle misure salvate, persistito in UserDefaults come JSON.
final class MeasurementStore: ObservableObject {
    @Published private(set) var items: [RoomMeasurement] = []

    private let key = "roomMeasurements"

    init() {
        if let data = UserDefaults.standard.data(forKey: key),
           let decoded = try? JSONDecoder().decode([RoomMeasurement].self, from: data) {
            items = decoded
        }
    }

    var rooms: [String] {
        var seen = Set<String>()
        return items.sorted { $0.date > $1.date }.compactMap { seen.insert($0.room).inserted ? $0.room : nil }
    }

    func measurements(in room: String) -> [RoomMeasurement] {
        items.filter { $0.room == room }.sorted { $0.date > $1.date }
    }

    func add(_ measurement: RoomMeasurement) {
        items.append(measurement)
        save()
    }

    func delete(_ measurement: RoomMeasurement) {
        items.removeAll { $0.id == measurement.id }
        save()
    }

    func deleteAll() {
        items = []
        save()
    }

    func csv() -> String {
        let formatter = ISO8601DateFormatter()
        func fmt(_ value: Double?) -> String { value.map { String(format: "%.1f", $0) } ?? "" }
        func fmt2(_ value: Double?) -> String { value.map { String(format: "%.2f", $0) } ?? "" }

        var lines = ["stanza;data;ponderazione;leq_db;min_db;max_db;picco_db;durata_s;rt60_s"]
        for m in items.sorted(by: { $0.date < $1.date }) {
            let room = m.room.replacingOccurrences(of: ";", with: ",")
            lines.append([
                room,
                formatter.string(from: m.date),
                m.weighting?.rawValue ?? "",
                fmt(m.leq), fmt(m.minLevel), fmt(m.maxLevel), fmt(m.peak),
                m.duration.map { String(Int($0)) } ?? "",
                fmt2(m.rt60),
            ].joined(separator: ";"))
        }
        return lines.joined(separator: "\n")
    }

    private func save() {
        if let data = try? JSONEncoder().encode(items) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }
}

enum NoiseLevel {
    /// Descrizione indicativa di un livello in dB(A) in ambito domestico
    static func description(for db: Double) -> String {
        switch db {
        case ..<25: return "Silenzio quasi assoluto"
        case ..<35: return "Molto silenzioso – ideale per dormire"
        case ..<45: return "Silenzioso – casa tranquilla"
        case ..<55: return "Moderato – ambiente domestico attivo"
        case ..<65: return "Conversazione normale"
        case ..<75: return "Rumoroso – TV alta, aspirapolvere"
        case ..<85: return "Molto rumoroso – traffico intenso"
        default: return "Pericoloso per esposizioni prolungate"
        }
    }
}
