import Foundation
import ScreenCaptureKit
import CoreMedia
import AudioToolbox
import CoreImage
import AppKit
import AVFoundation

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

// Use the native input device on macOS. WKWebView getUserMedia can remain
// pending even with TCC access enabled. No audio is saved by this helper.
final class MicrophoneCapture: NSObject, AVCaptureAudioDataOutputSampleBufferDelegate {
  // AVCaptureSession also supports Bluetooth devices whose AVAudioEngine tap
  // never fires on some macOS versions. Keep the user's selected input device.
  private let session = AVCaptureSession()
  private let outputQueue = DispatchQueue(label: "com.torvi.microphone-output")
  private var ready = false // accessed only by outputQueue
  private var runtimeObserver: NSObjectProtocol?

  func start() async throws {
    var authorization = AVCaptureDevice.authorizationStatus(for: .audio)
    if authorization == .notDetermined {
      _ = await AVCaptureDevice.requestAccess(for: .audio)
      authorization = AVCaptureDevice.authorizationStatus(for: .audio)
    }
    guard authorization == .authorized else {
      throw NSError(domain: "TorviMicrophone", code: 1, userInfo: [NSLocalizedDescriptionKey:
        "Microphone access is denied. Enable Torvi in System Settings → Privacy & Security → Microphone, then retry audio."])
    }
    guard let device = AVCaptureDevice.default(for: .audio) else {
      throw NSError(domain: "TorviMicrophone", code: 2, userInfo: [NSLocalizedDescriptionKey:
        "No microphone input is available. Select a working input device in System Settings → Sound."])
    }
    let input = try AVCaptureDeviceInput(device: device)
    let output = AVCaptureAudioDataOutput()
    output.audioSettings = [
      AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 24_000,
      AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false,
    ]
    output.setSampleBufferDelegate(self, queue: outputQueue)
    session.beginConfiguration()
    guard session.canAddInput(input), session.canAddOutput(output) else {
      session.commitConfiguration()
      throw NSError(domain: "TorviMicrophone", code: 3, userInfo: [NSLocalizedDescriptionKey:
        "The selected microphone cannot provide live audio. Select another input device, then retry audio."])
    }
    session.addInput(input)
    session.addOutput(output)
    session.commitConfiguration()
    runtimeObserver = NotificationCenter.default.addObserver(forName: .AVCaptureSessionRuntimeError, object: session, queue: nil) { notification in
      let error = notification.userInfo?[AVCaptureSessionErrorKey] as? NSError
      writeMessage(ControlMessage(event: "error", message: error?.localizedDescription ?? "Microphone capture stopped. Retry audio.",
        stage: "microphone-runtime-error", domain: error?.domain, code: error?.code))
      exit(1)
    }
    session.startRunning()
    outputQueue.asyncAfter(deadline: .now() + 8) { [self] in
      if !ready {
        writeMessage(ControlMessage(event: "error", message:
          "The microphone opened but produced no audio. Check the selected input device, then retry audio.",
          stage: "microphone-no-frames"))
        exit(1)
      }
    }
  }

  func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    guard sampleBuffer.isValid, CMSampleBufferGetNumSamples(sampleBuffer) > 0 else { return }
    if !ready {
      ready = true
      writeMessage(ControlMessage(event: "ready", stage: "microphone-running"))
    }
    writeAudioSamples(sampleBuffer)
  }
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
    writeAudioSamples(sampleBuffer)
  }
}

private func writeAudioSamples(_ sampleBuffer: CMSampleBuffer) {
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


final class ScreenSnapshot: NSObject, SCStreamOutput, SCStreamDelegate {
  private var stream: SCStream?
  private var delivered = false
  func start() async throws {
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
    let arguments = CommandLine.arguments
    let displayID = arguments.first(where: { $0.hasPrefix("--display-id=") }).flatMap { UInt32($0.split(separator: "=").last ?? "") }
    let excludePID = arguments.first(where: { $0.hasPrefix("--exclude-pid=") }).flatMap { Int32($0.split(separator: "=").last ?? "") }
    let pointer = CGEvent(source: nil)?.location ?? .zero
    guard let display = content.displays.first(where: { displayID != nil ? $0.displayID == displayID : $0.frame.contains(pointer) }) ?? content.displays.first else {
      throw NSError(domain: "Torvi", code: 1, userInfo: [NSLocalizedDescriptionKey: "No display is available."])
    }
    let apps = content.applications.filter { $0.processID == excludePID }
    let filter = SCContentFilter(display: display, excludingApplications: apps, exceptingWindows: [])
    let configuration = SCStreamConfiguration()
    let ratio = min(1, 1600.0 / Double(display.width))
    configuration.width = max(1, Int(Double(display.width) * ratio))
    configuration.height = max(1, Int(Double(display.height) * ratio))
    configuration.showsCursor = false
    configuration.capturesAudio = false
    configuration.minimumFrameInterval = CMTime(value: 1, timescale: 30)
    configuration.pixelFormat = kCVPixelFormatType_32BGRA
    let stream = SCStream(filter: filter, configuration: configuration, delegate: self)
    try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: DispatchQueue(label: "com.torvi.snapshot"))
    self.stream = stream
    try await stream.startCapture()
  }
  func stream(_ stream: SCStream, didStopWithError error: Error) {
    FileHandle.standardError.write(Data(error.localizedDescription.utf8)); exit(1)
  }
  func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
    guard type == .screen, !delivered, sampleBuffer.isValid,
          let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
          let rawStatus = attachments.first?[.status] as? Int,
          SCFrameStatus(rawValue: rawStatus) == .complete,
          let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    let image = CIImage(cvPixelBuffer: buffer)
    guard let jpeg = CIContext().jpegRepresentation(of: image, colorSpace: CGColorSpaceCreateDeviceRGB(), options: [:]) else { return }
    delivered = true
    FileHandle.standardOutput.write(jpeg)
    exit(0) // OS releases this one-shot stream; no screenshot is written to disk.
  }
}
if CommandLine.arguments.contains("--screenshot") {
  let snapshot = ScreenSnapshot()
  DispatchQueue.global().asyncAfter(deadline: .now() + 12) {
    FileHandle.standardError.write(Data("Screen capture timed out.".utf8)); exit(1)
  }
  Task {
    do { try await snapshot.start() }
    catch { FileHandle.standardError.write(Data(error.localizedDescription.utf8)); exit(1) }
  }
  RunLoop.main.run()
  exit(1)
}

if CommandLine.arguments.contains("--microphone") {
  let microphone = MicrophoneCapture()
  Task {
    do { try await microphone.start() }
    catch {
      let nativeError = error as NSError
      writeMessage(ControlMessage(event: "error", message: error.localizedDescription,
        stage: "microphone-start-failed", domain: nativeError.domain, code: nativeError.code))
      exit(1)
    }
  }
  RunLoop.main.run()
  exit(1)
}

let capture = AudioCapture()
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
// ScreenCaptureKit and permission callbacks need a live main run loop.
// SIGTERM retains its default exit behavior; macOS releases the capture device.
RunLoop.main.run()
