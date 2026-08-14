// Apple の on-device 音声認識で文字起こしし、JSON を標準出力に書く。
// 他エンジンと同じ形（text と時刻つき segments）に揃えている。

import AVFoundation
import Foundation
import Speech

struct Segment: Encodable {
    let start: Double
    let end: Double
    let text: String
}

struct Output: Encodable {
    let engine: String
    let locale: String
    let duration: Double
    let text: String
    let segments: [Segment]
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("\(message)\n".utf8))
    exit(1)
}

func value(after flag: String) -> String? {
    let args = CommandLine.arguments
    guard let index = args.firstIndex(of: flag), index + 1 < args.count else { return nil }
    return args[index + 1]
}

@main
struct AppleTranscribe {
    static func main() async {
        guard let input = value(after: "--input") else {
            fail("Usage: transcribe --input <audio> [--locale ja-JP]")
        }
        let localeID = value(after: "--locale") ?? "ja-JP"

        let url = URL(fileURLWithPath: input)
        guard FileManager.default.fileExists(atPath: url.path) else {
            fail("Input file not found: \(input)")
        }

        guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: localeID)) else {
            fail("Locale not supported by SpeechTranscriber: \(localeID)")
        }

        // 時刻つきで結果を受け取るため、プリセットではなく明示的に指定する。
        let transcriber = SpeechTranscriber(
            locale: locale,
            transcriptionOptions: [],
            reportingOptions: [],
            attributeOptions: [.audioTimeRange]
        )

        let status = await AssetInventory.status(forModules: [transcriber])
        if status != .installed && status != .supported {
            fail("Model assets not ready for \(locale.identifier): \(status)")
        }

        let analyzer = SpeechAnalyzer(modules: [transcriber])

        let audioFile: AVAudioFile
        do {
            audioFile = try AVAudioFile(forReading: url)
        } catch {
            fail("Could not open audio file: \(error.localizedDescription)")
        }
        let duration = Double(audioFile.length) / audioFile.fileFormat.sampleRate

        var segments: [Segment] = []
        var full = ""

        let collector = Task {
            for try await result in transcriber.results {
                let attributed = result.text
                let plain = String(attributed.characters)
                full += plain
                var lower = Double.greatestFiniteMagnitude
                var upper = 0.0
                for run in attributed.runs {
                    guard let range = run.audioTimeRange else { continue }
                    lower = min(lower, range.start.seconds)
                    upper = max(upper, range.end.seconds)
                }
                if lower <= upper {
                    let trimmed = plain.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !trimmed.isEmpty {
                        segments.append(Segment(start: lower, end: upper, text: trimmed))
                    }
                }
            }
        }

        do {
            if let last = try await analyzer.analyzeSequence(from: audioFile) {
                try await analyzer.finalizeAndFinish(through: last)
            } else {
                try await analyzer.finalizeAndFinishThroughEndOfInput()
            }
            try await collector.value
        } catch {
            fail("Transcription failed: \(error.localizedDescription)")
        }

        let output = Output(
            engine: "apple-speechtranscriber",
            locale: locale.identifier,
            duration: duration,
            text: full.trimmingCharacters(in: .whitespacesAndNewlines),
            segments: segments
        )

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        guard let data = try? encoder.encode(output) else { fail("Could not encode result") }
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data("\n".utf8))
    }
}
