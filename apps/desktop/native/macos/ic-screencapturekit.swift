import Foundation
import ScreenCaptureKit
import CoreMedia
import AudioToolbox

struct AudioChunk: Codable {
  let data: String
  let sampleRate: Double
  let channels: UInt32
  let frames: Int
  let format: String
}

struct ControlMessage: Codable {
  let event: String
  let message: String?
  let stage: String?
  let domain: String?
  let code: Int?
  let displayCount: Int?

  init(
    event: String,
    message: String? = nil,
    stage: String? = nil,
    domain: String? = nil,
    code: Int? = nil,
    displayCount: Int? = nil
  ) {
    self.event = event
    self.message = message
    self.stage = stage
    self.domain = domain
    self.code = code
    self.displayCount = displayCount
  }
}

private let outputLock = NSLock()

private func writeMessage<T: Encodable>(_ message: T) {
  guard let encoded = try? JSONEncoder().encode(message) else { return }
  outputLock.lock()
  defer { outputLock.unlock() }
  FileHandle.standardOutput.write(encoded)
  FileHandle.standardOutput.write(Data([0x0A]))
}

final class AudioCapture: NSObject, SCStreamOutput, SCStreamDelegate {
  private var stream: SCStream?

  func start() async throws {
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
    writeMessage(ControlMessage(
      event: "content-ready",
      stage: "shareable-content-retrieved",
      displayCount: content.displays.count
    ))
    guard let display = content.displays.first else { throw NSError(domain: "InterviewCopilot", code: 1) }
    let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
    let configuration = SCStreamConfiguration()
    configuration.capturesAudio = true
    configuration.excludesCurrentProcessAudio = true
    configuration.width = 2
    configuration.height = 2
    configuration.minimumFrameInterval = CMTime(value: 1, timescale: 1)
    configuration.sampleRate = 24_000
    configuration.channelCount = 1
    let stream = SCStream(filter: filter, configuration: configuration, delegate: self)
    try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: DispatchQueue(label: "com.interviewcopilot.system-audio"))
    writeMessage(ControlMessage(event: "stream-created", stage: "stream-output-configured"))
    try await stream.startCapture()
    self.stream = stream
    writeMessage(ControlMessage(event: "capture-started", stage: "stream-started"))
  }

  func stream(_ stream: SCStream, didStopWithError error: Error) {
    let nativeError = error as NSError
    writeMessage(ControlMessage(
      event: "error",
      message: "ScreenCaptureKit stopped: \(error.localizedDescription)",
      stage: "stream-stopped",
      domain: nativeError.domain,
      code: nativeError.code
    ))
  }

  func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
    guard type == .audio, sampleBuffer.isValid else { return }
    guard let description = CMSampleBufferGetFormatDescription(sampleBuffer),
          let streamDescription = CMAudioFormatDescriptionGetStreamBasicDescription(description) else { return }
    let source = streamDescription.pointee
    let frameCount = CMSampleBufferGetNumSamples(sampleBuffer)
    guard frameCount > 0, source.mSampleRate > 0 else { return }
    var requiredSize = 0
    _ = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
      sampleBuffer,
      bufferListSizeNeededOut: &requiredSize,
      bufferListOut: nil,
      bufferListSize: 0,
      blockBufferAllocator: kCFAllocatorDefault,
      blockBufferMemoryAllocator: kCFAllocatorDefault,
      flags: kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment,
      blockBufferOut: nil
    )
    guard requiredSize >= MemoryLayout<AudioBufferList>.size else { return }
    let rawList = UnsafeMutableRawPointer.allocate(byteCount: requiredSize, alignment: MemoryLayout<AudioBufferList>.alignment)
    defer { rawList.deallocate() }
    let list = rawList.bindMemory(to: AudioBufferList.self, capacity: 1)
    var retainedBlock: CMBlockBuffer?
    let status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
      sampleBuffer,
      bufferListSizeNeededOut: nil,
      bufferListOut: list,
      bufferListSize: requiredSize,
      blockBufferAllocator: kCFAllocatorDefault,
      blockBufferMemoryAllocator: kCFAllocatorDefault,
      flags: kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment,
      blockBufferOut: &retainedBlock
    )
    guard status == noErr else { return }
    let buffers = UnsafeMutableAudioBufferListPointer(list)
    let channelCount = max(1, Int(source.mChannelsPerFrame))
    let isFloat = (source.mFormatFlags & kAudioFormatFlagIsFloat) != 0
    let isNonInterleaved = (source.mFormatFlags & kAudioFormatFlagIsNonInterleaved) != 0
    guard (isFloat && source.mBitsPerChannel == 32) || (!isFloat && source.mBitsPerChannel == 16) else { return }

    func sample(buffer: AudioBuffer, index: Int) -> Float {
      guard let data = buffer.mData else { return 0 }
      if isFloat { return data.assumingMemoryBound(to: Float.self)[index] }
      return Float(data.assumingMemoryBound(to: Int16.self)[index]) / 32_768
    }

    var mono = [Float](repeating: 0, count: frameCount)
    for frame in 0..<frameCount {
      var mixed: Float = 0
      if isNonInterleaved {
        for channel in 0..<min(channelCount, buffers.count) { mixed += sample(buffer: buffers[channel], index: frame) }
      } else if let interleaved = buffers.first {
        for channel in 0..<channelCount { mixed += sample(buffer: interleaved, index: frame * channelCount + channel) }
      }
      mono[frame] = mixed / Float(channelCount)
    }

    let targetRate = 24_000.0
    let outputCount = max(1, Int((Double(frameCount) * targetRate / source.mSampleRate).rounded()))
    var pcm = [Int16](repeating: 0, count: outputCount)
    for outputIndex in 0..<outputCount {
      let sourcePosition = Double(outputIndex) * source.mSampleRate / targetRate
      let lower = min(frameCount - 1, Int(sourcePosition))
      let upper = min(frameCount - 1, lower + 1)
      let fraction = Float(sourcePosition - Double(lower))
      let value = mono[lower] + (mono[upper] - mono[lower]) * fraction
      pcm[outputIndex] = Int16(max(-1, min(1, value)) * 32_767)
    }
    let data = pcm.withUnsafeBytes { Data($0) }
    let chunk = AudioChunk(
      data: data.base64EncodedString(),
      sampleRate: targetRate,
      channels: 1,
      frames: outputCount,
      format: "s16le"
    )
    writeMessage(chunk)
  }
}

let capture = AudioCapture()
let semaphore = DispatchSemaphore(value: 0)
Task {
  do {
    try await capture.start()
    writeMessage(ControlMessage(event: "ready", stage: "stream-running"))
  } catch {
    let nativeError = error as NSError
    let details = "ScreenCaptureKit could not start: \(error.localizedDescription)"
    writeMessage(ControlMessage(
      event: "error",
      message: details,
      stage: "stream-start-failed",
      domain: nativeError.domain,
      code: nativeError.code
    ))
    FileHandle.standardError.write(Data((details + "\n").utf8))
    exit(1)
  }
}
signal(SIGTERM) { _ in semaphore.signal() }
signal(SIGINT) { _ in semaphore.signal() }
semaphore.wait()
