import AVFoundation
import UIKit

/// Fonometro: gestisce il microfono e calcola livello istantaneo, minimo, massimo, Leq e picco.
/// I valori interni sono in dBFS; quelli esposti alla UI sono calibrati con `calibrationOffset`.
final class SoundLevelMeter: ObservableObject {
    struct Sample: Identifiable {
        let time: Double
        let levelFS: Double
        var id: Double { time }
    }

    static let defaultCalibrationOffset = 110.0
    static let historyWindow = 60.0

    @Published private(set) var isRunning = false
    @Published private(set) var permissionDenied = false
    @Published var errorMessage: String?

    @Published private(set) var levelFS: Double?
    @Published private(set) var minFS: Double?
    @Published private(set) var maxFS: Double?
    @Published private(set) var peakFS: Double?
    @Published private(set) var elapsed: Double = 0
    @Published private(set) var history: [Sample] = []

    @Published var calibrationOffset: Double {
        didSet { UserDefaults.standard.set(calibrationOffset, forKey: Keys.calibration) }
    }

    @Published var weighting: FrequencyWeighting {
        didSet {
            UserDefaults.standard.set(weighting.rawValue, forKey: Keys.weighting)
            processor?.setWeighting(weighting)
            reset()
        }
    }

    @Published var timeWeighting: TimeWeighting {
        didSet {
            UserDefaults.standard.set(timeWeighting.rawValue, forKey: Keys.timeWeighting)
            processor?.setTimeWeighting(timeWeighting)
        }
    }

    /// Riceve i livelli a blocchi di 10 ms (dBFS, non pesati) sul main thread.
    var blockLevelHandler: (([Float]) -> Void)?

    private enum Keys {
        static let calibration = "calibrationOffset"
        static let weighting = "frequencyWeighting"
        static let timeWeighting = "timeWeighting"
    }

    private let engine = AVAudioEngine()
    private var processor: LevelProcessor?
    private var energySum = 0.0
    private var energyTime = 0.0
    private var interruptionObserver: NSObjectProtocol?

    init() {
        let defaults = UserDefaults.standard
        calibrationOffset = defaults.object(forKey: Keys.calibration) as? Double ?? Self.defaultCalibrationOffset
        weighting = FrequencyWeighting(rawValue: defaults.string(forKey: Keys.weighting) ?? "") ?? .a
        timeWeighting = TimeWeighting(rawValue: defaults.string(forKey: Keys.timeWeighting) ?? "") ?? .fast

        interruptionObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            self?.handleInterruption(notification)
        }
    }

    // MARK: - Valori calibrati

    func calibrated(_ fs: Double?) -> Double? {
        fs.map { $0 + calibrationOffset }
    }

    var level: Double? { calibrated(levelFS) }
    var minLevel: Double? { calibrated(minFS) }
    var maxLevel: Double? { calibrated(maxFS) }
    var peak: Double? { calibrated(peakFS) }

    /// Livello continuo equivalente (media energetica) dall'ultimo azzeramento
    var leq: Double? {
        guard energyTime > 0 else { return nil }
        return 10 * log10(max(energySum / energyTime, 1e-12)) + calibrationOffset
    }

    // MARK: - Controllo

    func start() {
        guard !isRunning else { return }
        AVAudioApplication.requestRecordPermission { [weak self] granted in
            DispatchQueue.main.async {
                guard let self else { return }
                if granted {
                    self.permissionDenied = false
                    self.startEngine()
                } else {
                    self.permissionDenied = true
                }
            }
        }
    }

    func stop() {
        guard isRunning else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        processor = nil
        isRunning = false
        UIApplication.shared.isIdleTimerDisabled = false
    }

    func reset() {
        levelFS = nil
        minFS = nil
        maxFS = nil
        peakFS = nil
        elapsed = 0
        history = []
        energySum = 0
        energyTime = 0
    }

    private func startEngine() {
        guard !isRunning else { return }
        do {
            let session = AVAudioSession.sharedInstance()
            // La modalità "measurement" disattiva AGC ed elaborazioni del segnale del microfono
            try session.setCategory(.record, mode: .measurement, options: [])
            try session.setActive(true)

            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            guard format.sampleRate > 0, format.channelCount > 0 else {
                errorMessage = "Microfono non disponibile su questo dispositivo."
                return
            }

            let processor = LevelProcessor(
                sampleRate: format.sampleRate,
                weighting: weighting,
                timeWeighting: timeWeighting
            )
            self.processor = processor

            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, _ in
                guard let frame = processor.process(buffer) else { return }
                DispatchQueue.main.async {
                    self?.consume(frame)
                }
            }

            engine.prepare()
            try engine.start()

            reset()
            errorMessage = nil
            isRunning = true
            UIApplication.shared.isIdleTimerDisabled = true
        } catch {
            errorMessage = "Impossibile avviare il microfono: \(error.localizedDescription)"
            engine.inputNode.removeTap(onBus: 0)
            processor = nil
        }
    }

    private func consume(_ frame: LevelFrame) {
        guard isRunning else { return }

        let current = 10 * log10(max(frame.smoothedMeanSquare, 1e-12))
        elapsed += frame.duration
        energySum += frame.rawMeanSquare * frame.duration
        energyTime += frame.duration
        levelFS = current

        // Ignora il primo mezzo secondo: il filtro e la media temporale si stanno assestando
        if elapsed > 0.5 {
            minFS = min(minFS ?? current, current)
            maxFS = max(maxFS ?? current, current)
        }

        let peakDB = 20 * log10(max(frame.peak, 1e-9))
        peakFS = max(peakFS ?? peakDB, peakDB)

        history.append(Sample(time: elapsed, levelFS: current))
        let cutoff = elapsed - Self.historyWindow
        if let first = history.first, first.time < cutoff {
            history.removeAll { $0.time < cutoff }
        }

        if !frame.blockLevels.isEmpty {
            blockLevelHandler?(frame.blockLevels)
        }
    }

    private func handleInterruption(_ notification: Notification) {
        guard
            let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
            AVAudioSession.InterruptionType(rawValue: raw) == .began
        else { return }
        stop()
    }
}
