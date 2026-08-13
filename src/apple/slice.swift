// 音声を切り出して 16kHz モノラルの WAV に変換する。
// Cloud Speech の同期 Recognize は1分未満の音声しか受け付けないため、
// GCS を経由せずに済ませる目的で使う。

import AVFoundation
import Foundation

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("\(message)\n".utf8))
    exit(1)
}

func value(after flag: String) -> String? {
    let args = CommandLine.arguments
    guard let index = args.firstIndex(of: flag), index + 1 < args.count else { return nil }
    return args[index + 1]
}

guard let input = value(after: "--input") else {
    fail("Usage: slice --input <audio> --output <wav> [--start s] [--end s]")
}
guard let output = value(after: "--output") else { fail("Missing --output") }
let start = Double(value(after: "--start") ?? "0") ?? 0
let endArg = value(after: "--end").flatMap(Double.init)

let inputFile: AVAudioFile
do {
    inputFile = try AVAudioFile(forReading: URL(fileURLWithPath: input))
} catch {
    fail("Could not open input: \(error.localizedDescription)")
}

let sourceFormat = inputFile.processingFormat
let sourceRate = sourceFormat.sampleRate
let totalSeconds = Double(inputFile.length) / sourceRate
let end = min(endArg ?? totalSeconds, totalSeconds)
guard end > start else { fail("--end must be greater than --start") }

guard let targetFormat = AVAudioFormat(
    commonFormat: .pcmFormatInt16,
    sampleRate: 16000,
    channels: 1,
    interleaved: true
) else {
    fail("Could not build 16kHz mono format")
}

guard let converter = AVAudioConverter(from: sourceFormat, to: targetFormat) else {
    fail("Could not build converter")
}

let startFrame = AVAudioFramePosition(start * sourceRate)
let frameCount = AVAudioFrameCount((end - start) * sourceRate)
inputFile.framePosition = startFrame

guard let sourceBuffer = AVAudioPCMBuffer(pcmFormat: sourceFormat, frameCapacity: frameCount) else {
    fail("Could not allocate source buffer")
}
do {
    try inputFile.read(into: sourceBuffer, frameCount: frameCount)
} catch {
    fail("Could not read audio: \(error.localizedDescription)")
}

let ratio = targetFormat.sampleRate / sourceFormat.sampleRate
let targetCapacity = AVAudioFrameCount(Double(sourceBuffer.frameLength) * ratio) + 1024
guard let targetBuffer = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: targetCapacity) else {
    fail("Could not allocate target buffer")
}

var supplied = false
var conversionError: NSError?
converter.convert(to: targetBuffer, error: &conversionError) { _, status in
    if supplied {
        status.pointee = .noDataNow
        return nil
    }
    supplied = true
    status.pointee = .haveData
    return sourceBuffer
}
if let conversionError {
    fail("Conversion failed: \(conversionError.localizedDescription)")
}

let settings: [String: Any] = [
    AVFormatIDKey: kAudioFormatLinearPCM,
    AVSampleRateKey: 16000.0,
    AVNumberOfChannelsKey: 1,
    AVLinearPCMBitDepthKey: 16,
    AVLinearPCMIsFloatKey: false,
    AVLinearPCMIsBigEndianKey: false,
    AVLinearPCMIsNonInterleaved: false,
]

do {
    let outURL = URL(fileURLWithPath: output)
    let outFile = try AVAudioFile(forWriting: outURL, settings: settings, commonFormat: .pcmFormatInt16, interleaved: true)
    try outFile.write(from: targetBuffer)
} catch {
    fail("Could not write output: \(error.localizedDescription)")
}

print("\(output) \(String(format: "%.2f", start))-\(String(format: "%.2f", end)) frames=\(targetBuffer.frameLength)")
