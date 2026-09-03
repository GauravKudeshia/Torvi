import assert from 'node:assert/strict';
import test from 'node:test';
import { chunkLevel, decodeAudioChunk, type AudioChunk } from '../apps/desktop/src/system-audio-bridge';

function pcm16Chunk(samples: number[], channels = 1): AudioChunk {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((sample, index) => view.setInt16(index * 2, sample, true));
  return {
    data: Buffer.from(bytes).toString('base64'),
    sampleRate: 24_000,
    channels,
    frames: samples.length / channels,
    format: 's16le',
  };
}

test('decodes and downmixes native PCM into a WebRTC-ready mono signal', () => {
  const decoded = decodeAudioChunk(pcm16Chunk([16_384, -16_384, 8_192, 8_192], 2));
  assert.equal(decoded.length, 2);
  assert.ok(Math.abs(decoded[0]) < 0.0001);
  assert.ok(Math.abs(decoded[1] - 0.25) < 0.0001);
});

test('reports silence separately from audible system audio', () => {
  assert.equal(chunkLevel(decodeAudioChunk(pcm16Chunk([0, 0, 0, 0]))), 0);
  assert.ok(chunkLevel(decodeAudioChunk(pcm16Chunk([16_384, -16_384, 16_384, -16_384]))) > 0.5);
});
