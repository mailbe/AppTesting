import Foundation

/// Stima del tempo di riverberazione (RT60) con il metodo dell'impulso (battito di mani).
/// Usa l'integrazione inversa di Schroeder e una regressione lineare su T20 (o T10 se
/// la dinamica disponibile è insufficiente).
final class ReverbAnalyzer: ObservableObject {
    enum State: Equatable {
        case idle
        case calibrating
        case armed
        case recording
        case done(Double)
        case failed(String)
    }

    struct DecayPoint: Identifiable {
        let time: Double
        let level: Double
        var id: Double { time }
    }

    @Published private(set) var state: State = .idle
    @Published private(set) var results: [Double] = []
    @Published private(set) var decay: [DecayPoint] = []
    @Published private(set) var schroeder: [DecayPoint] = []
    @Published private(set) var method: String?

    private let blockDuration = LevelProcessor.blockDuration
    private let calibrationBlocks = 100   // 1 s di rumore di fondo
    private let recordingBlocks = 300     // 3 s dopo l'impulso
    private let triggerMargin: Float = 20 // dB sopra il rumore di fondo

    private var background: [Float] = []
    private var recording: [Float] = []
    private var noiseFloor: Float = -120

    var average: Double? {
        guard !results.isEmpty else { return nil }
        return results.reduce(0, +) / Double(results.count)
    }

    var isActive: Bool {
        switch state {
        case .calibrating, .armed, .recording: return true
        default: return false
        }
    }

    func arm() {
        background = []
        recording = []
        state = .calibrating
    }

    func cancel() {
        state = .idle
    }

    func clearResults() {
        results = []
        decay = []
        schroeder = []
        method = nil
        state = .idle
    }

    func ingest(_ blocks: [Float]) {
        for level in blocks {
            switch state {
            case .calibrating:
                background.append(level)
                if background.count >= calibrationBlocks {
                    noiseFloor = median(background)
                    state = .armed
                }
            case .armed:
                if level > noiseFloor + triggerMargin {
                    recording = Array(background.suffix(5)) + [level]
                    state = .recording
                } else {
                    background.append(level)
                    if background.count > calibrationBlocks {
                        background.removeFirst(background.count - calibrationBlocks)
                    }
                }
            case .recording:
                recording.append(level)
                if recording.count >= recordingBlocks {
                    analyze()
                    return
                }
            case .idle, .done, .failed:
                return
            }
        }
    }

    private func analyze() {
        let levels = recording.map(Double.init)
        guard let peakIndex = levels.indices.max(by: { levels[$0] < levels[$1] }) else {
            state = .failed("Nessun dato registrato.")
            return
        }
        let peak = levels[peakIndex]
        let noise = Double(noiseFloor)
        let dynamicRange = peak - noise

        guard dynamicRange >= 25 else {
            state = .failed("Impulso troppo debole rispetto al rumore di fondo (\(Int(dynamicRange)) dB). Batti le mani più forte o riduci i rumori nella stanza.")
            return
        }

        // Curva di decadimento grezza, relativa al picco
        decay = levels.indices.compactMap { i -> DecayPoint? in
            guard i >= peakIndex - 5 else { return nil }
            return DecayPoint(time: Double(i - peakIndex) * blockDuration, level: levels[i] - peak)
        }

        // Energia al netto del rumore, troncata quando il segnale raggiunge il rumore di fondo
        let tail = Array(levels[peakIndex...])
        let end = tail.firstIndex(where: { $0 <= noise + 3 }) ?? tail.count
        let noiseEnergy = pow(10, noise / 10)
        let energies = tail.prefix(end).map { max(pow(10, $0 / 10) - noiseEnergy, 0) }
        guard energies.count >= 5 else {
            state = .failed("Decadimento troppo breve per essere misurato. Riprova.")
            return
        }

        // Integrazione inversa di Schroeder
        var edc = [Double](repeating: 0, count: energies.count)
        var accumulator = 0.0
        for i in stride(from: energies.count - 1, through: 0, by: -1) {
            accumulator += energies[i]
            edc[i] = accumulator
        }
        guard let total = edc.first, total > 0 else {
            state = .failed("Segnale non valido. Riprova.")
            return
        }
        let edcDB = edc.map { 10 * log10(max($0 / total, 1e-12)) }
        schroeder = edcDB.enumerated().map { DecayPoint(time: Double($0.offset) * blockDuration, level: $0.element) }

        let lower: Double
        if dynamicRange >= 35 {
            lower = -25
            method = "T20"
        } else {
            lower = -15
            method = "T10"
        }

        let points = edcDB.enumerated().filter { $0.element <= -5 && $0.element >= lower }
        guard points.count >= 3 else {
            state = .failed("Decadimento troppo rapido o irregolare. Riprova in un punto diverso della stanza.")
            return
        }

        let xs = points.map { Double($0.offset) * blockDuration }
        let ys = points.map(\.element)
        guard let slope = linearRegressionSlope(xs: xs, ys: ys), slope < 0 else {
            state = .failed("Impossibile stimare il decadimento. Riprova.")
            return
        }

        let rt60 = -60 / slope
        guard (0.05...5).contains(rt60) else {
            state = .failed("Valore fuori scala (\(String(format: "%.2f", rt60)) s). Riprova.")
            return
        }

        results.append(rt60)
        state = .done(rt60)
    }

    private func linearRegressionSlope(xs: [Double], ys: [Double]) -> Double? {
        let n = Double(xs.count)
        let meanX = xs.reduce(0, +) / n
        let meanY = ys.reduce(0, +) / n
        var num = 0.0
        var den = 0.0
        for (x, y) in zip(xs, ys) {
            num += (x - meanX) * (y - meanY)
            den += (x - meanX) * (x - meanX)
        }
        return den > 0 ? num / den : nil
    }

    private func median(_ values: [Float]) -> Float {
        let sorted = values.sorted()
        return sorted[sorted.count / 2]
    }

    static func interpretation(for rt60: Double) -> String {
        switch rt60 {
        case ..<0.3: return "Molto secca: tanto assorbimento acustico."
        case ..<0.5: return "Secca: ottima per camere da letto e studio."
        case ..<0.8: return "Equilibrata: tipica di un soggiorno arredato."
        case ..<1.2: return "Riverberante: si percepisce eco, tipica di stanze vuote."
        default: return "Molto riverberante: valuta tappeti, tende, librerie o pannelli fonoassorbenti."
        }
    }
}
