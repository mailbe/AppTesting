import AVFoundation

enum FrequencyWeighting: String, CaseIterable, Identifiable, Codable {
    case a = "A"
    case z = "Z"

    var id: String { rawValue }

    var unit: String { self == .a ? "dB(A)" : "dB(Z)" }

    var description: String {
        switch self {
        case .a: return "A – come l'orecchio umano (consigliata)"
        case .z: return "Z – lineare, nessun filtro"
        }
    }
}

enum TimeWeighting: String, CaseIterable, Identifiable, Codable {
    case fast
    case slow

    var id: String { rawValue }

    /// Costante di tempo in secondi (IEC 61672)
    var timeConstant: Double { self == .fast ? 0.125 : 1.0 }

    var label: String { self == .fast ? "Fast (125 ms)" : "Slow (1 s)" }
}

/// Risultato dell'elaborazione di un buffer audio. Tutti i livelli sono in dBFS (non calibrati).
struct LevelFrame {
    /// Media quadratica pesata nel tempo (Fast/Slow) alla fine del buffer
    var smoothedMeanSquare: Double
    /// Media quadratica del buffer, senza pesatura temporale (per il calcolo del Leq)
    var rawMeanSquare: Double
    /// Valore assoluto massimo dei campioni
    var peak: Double
    /// Durata del buffer in secondi
    var duration: Double
    /// Livelli non pesati in dBFS su blocchi da 10 ms (per l'analisi del riverbero)
    var blockLevels: [Float]
}

/// Elabora i buffer del microfono. Va usato solo dal thread audio del tap,
/// tranne i setter della configurazione che sono protetti da lock.
final class LevelProcessor {
    static let blockDuration = 0.01

    private let sampleRate: Double
    private let blockSize: Int
    private let lock = NSLock()

    private var weighting: FrequencyWeighting
    private var smoothingCoefficient: Double
    private var filter: AWeightingFilter

    private var smoothedMeanSquare = 0.0
    private var blockSum = 0.0
    private var blockCount = 0

    init(sampleRate: Double, weighting: FrequencyWeighting, timeWeighting: TimeWeighting) {
        self.sampleRate = sampleRate
        self.blockSize = max(1, Int(sampleRate * Self.blockDuration))
        self.weighting = weighting
        self.smoothingCoefficient = Self.coefficient(for: timeWeighting, sampleRate: sampleRate)
        self.filter = AWeightingFilter(sampleRate: sampleRate)
    }

    private static func coefficient(for timeWeighting: TimeWeighting, sampleRate: Double) -> Double {
        exp(-1 / (sampleRate * timeWeighting.timeConstant))
    }

    func setWeighting(_ newValue: FrequencyWeighting) {
        lock.lock()
        weighting = newValue
        filter = AWeightingFilter(sampleRate: sampleRate)
        lock.unlock()
    }

    func setTimeWeighting(_ newValue: TimeWeighting) {
        lock.lock()
        smoothingCoefficient = Self.coefficient(for: newValue, sampleRate: sampleRate)
        lock.unlock()
    }

    func process(_ buffer: AVAudioPCMBuffer) -> LevelFrame? {
        guard let channels = buffer.floatChannelData, buffer.frameLength > 0 else { return nil }
        let samples = channels[0]
        let count = Int(buffer.frameLength)

        lock.lock()
        defer { lock.unlock() }

        let useAWeighting = weighting == .a
        let c = smoothingCoefficient
        var sumSquares = 0.0
        var peak = 0.0
        var blockLevels: [Float] = []

        for i in 0..<count {
            let x = samples[i]
            let ax = Double(abs(x))
            if ax > peak { peak = ax }

            let xd = Double(x)
            blockSum += xd * xd
            blockCount += 1
            if blockCount == blockSize {
                let ms = blockSum / Double(blockSize)
                blockLevels.append(Float(10 * log10(max(ms, 1e-12))))
                blockSum = 0
                blockCount = 0
            }

            let y = useAWeighting ? Double(filter.process(x)) : xd
            let y2 = y * y
            sumSquares += y2
            smoothedMeanSquare = c * smoothedMeanSquare + (1 - c) * y2
        }

        return LevelFrame(
            smoothedMeanSquare: smoothedMeanSquare,
            rawMeanSquare: sumSquares / Double(count),
            peak: peak,
            duration: Double(count) / sampleRate,
            blockLevels: blockLevels
        )
    }
}
