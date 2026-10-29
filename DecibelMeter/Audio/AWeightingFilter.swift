import Foundation

/// Filtro di ponderazione A (IEC 61672) realizzato come cascata di tre biquad,
/// ottenuti con trasformazione bilineare dalla funzione di trasferimento analogica.
struct AWeightingFilter {
    private struct Biquad {
        var b0: Double, b1: Double, b2: Double
        var a1: Double, a2: Double
        var z1 = 0.0, z2 = 0.0

        mutating func process(_ x: Double) -> Double {
            // Forma diretta II trasposta
            let y = b0 * x + z1
            z1 = b1 * x - a1 * y + z2
            z2 = b2 * x - a2 * y
            return y
        }

        func response(at frequency: Double, sampleRate: Double) -> Double {
            let w = 2 * Double.pi * frequency / sampleRate
            // z^-1 = cos(w) - j sin(w)
            let c1 = cos(w), s1 = -sin(w)
            let c2 = cos(2 * w), s2 = -sin(2 * w)
            let numRe = b0 + b1 * c1 + b2 * c2
            let numIm = b1 * s1 + b2 * s2
            let denRe = 1 + a1 * c1 + a2 * c2
            let denIm = a1 * s1 + a2 * s2
            return sqrt(numRe * numRe + numIm * numIm) / sqrt(denRe * denRe + denIm * denIm)
        }
    }

    private var sections: [Biquad]
    private let gain: Double

    init(sampleRate: Double) {
        let k = 2 * sampleRate
        func omega(_ f: Double) -> Double { 2 * Double.pi * f }
        let w1 = omega(20.598997)
        let w2 = omega(107.65265)
        let w3 = omega(737.86223)
        let w4 = omega(12194.217)

        // Analogico: (b2 s² + b1 s + b0) / (a2 s² + a1 s + a0) -> digitale
        func bilinear(b: (Double, Double, Double), a: (Double, Double, Double)) -> Biquad {
            let (bs2, bs1, bs0) = b
            let (as2, as1, as0) = a
            let a0 = as2 * k * k + as1 * k + as0
            return Biquad(
                b0: (bs2 * k * k + bs1 * k + bs0) / a0,
                b1: (2 * bs0 - 2 * bs2 * k * k) / a0,
                b2: (bs2 * k * k - bs1 * k + bs0) / a0,
                a1: (2 * as0 - 2 * as2 * k * k) / a0,
                a2: (as2 * k * k - as1 * k + as0) / a0
            )
        }

        sections = [
            bilinear(b: (1, 0, 0), a: (1, 2 * w1, w1 * w1)),
            bilinear(b: (1, 0, 0), a: (1, w2 + w3, w2 * w3)),
            bilinear(b: (0, 0, 1), a: (1, 2 * w4, w4 * w4)),
        ]

        // Normalizza a 0 dB a 1 kHz
        let response = sections.reduce(1.0) { $0 * $1.response(at: 1000, sampleRate: sampleRate) }
        gain = 1 / response
    }

    mutating func process(_ sample: Float) -> Float {
        var y = Double(sample)
        for i in sections.indices {
            y = sections[i].process(y)
        }
        return Float(y * gain)
    }
}
