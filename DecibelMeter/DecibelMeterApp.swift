import SwiftUI

@main
struct DecibelMeterApp: App {
    @StateObject private var meter = SoundLevelMeter()
    @StateObject private var reverb = ReverbAnalyzer()
    @StateObject private var store = MeasurementStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(meter)
                .environmentObject(reverb)
                .environmentObject(store)
                .onAppear {
                    let analyzer = reverb
                    meter.blockLevelHandler = { [weak analyzer] blocks in
                        analyzer?.ingest(blocks)
                    }
                }
        }
    }
}
