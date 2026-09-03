export type AudioChunk = {
  data: string;
  sampleRate: number;
  channels: number;
  frames: number;
  format: 'f32le' | 's16le';
};

export type SystemAudioBridge = {
  stream: MediaStream;
  push(samples: Float32Array, sampleRate: number): boolean;
  close(): Promise<void>;
};

export function decodeAudioChunk(chunk: AudioChunk) {
  const binary = atob(chunk.data);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const width = chunk.format === 'f32le' ? 4 : 2;
  const channels = Math.max(1, chunk.channels);
  const frames = Math.floor(bytes.byteLength / width / channels);
  const samples = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let mixed = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const offset = (frame * channels + channel) * width;
      mixed += chunk.format === 'f32le'
        ? view.getFloat32(offset, true)
        : view.getInt16(offset, true) / 32768;
    }
    samples[frame] = Math.max(-1, Math.min(1, mixed / channels));
  }
  return samples;
}

export function chunkLevel(samples: Float32Array) {
  if (!samples.length) return 0;
  let energy = 0;
  for (const sample of samples) {
    if (Number.isFinite(sample)) energy += Math.min(1, sample * sample);
  }
  return Math.min(1, Math.sqrt(energy / samples.length) * 3.5);
}

export async function createSystemAudioBridge(): Promise<SystemAudioBridge> {
  const audioContext = new AudioContext({ latencyHint: 'interactive' });
  const destination = audioContext.createMediaStreamDestination();
  const silence = audioContext.createConstantSource();
  const silenceGain = audioContext.createGain();
  silenceGain.gain.value = 0;
  silence.connect(silenceGain).connect(destination);
  silence.start();
  if (audioContext.state === 'suspended') await audioContext.resume();

  const track = destination.stream.getAudioTracks()[0];
  if (!track) {
    silence.stop();
    await audioContext.close();
    throw new Error('The Mac system-audio WebRTC track could not be created.');
  }
  track.contentHint = 'speech';
  let closed = false;
  let nextStartTime = audioContext.currentTime + 0.04;

  return {
    stream: destination.stream,
    push(samples, sampleRate) {
      if (closed || !samples.length || sampleRate <= 0) return false;
      const now = audioContext.currentTime;
      if (nextStartTime < now) nextStartTime = now + 0.04;
      if (nextStartTime - now > 0.6) return false;
      const buffer = audioContext.createBuffer(1, samples.length, sampleRate);
      const ownedSamples = new Float32Array(samples.length);
      ownedSamples.set(samples);
      buffer.copyToChannel(ownedSamples, 0);
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(destination);
      source.addEventListener('ended', () => source.disconnect(), { once: true });
      source.start(nextStartTime);
      nextStartTime += samples.length / sampleRate;
      return true;
    },
    async close() {
      if (closed) return;
      closed = true;
      destination.stream.getTracks().forEach((item) => item.stop());
      try { silence.stop(); } catch { /* already stopped */ }
      if (audioContext.state !== 'closed') await audioContext.close();
    },
  };
}
