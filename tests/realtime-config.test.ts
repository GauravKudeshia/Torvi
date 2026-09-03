import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_VAD_TRANSCRIPTION_MODEL,
  LIVE_TRANSCRIPTION_MODEL,
  requiresClientTurnDetection,
  selectRealtimeTranscriptionModel,
} from '@/lib/realtime';

test('native channels replace the live-only model with a VAD-compatible transcription model', () => {
  const model = selectRealtimeTranscriptionModel(LIVE_TRANSCRIPTION_MODEL, false);
  assert.equal(model, DEFAULT_VAD_TRANSCRIPTION_MODEL);
  assert.equal(requiresClientTurnDetection(model, false), false);
});

test('browser capture keeps live transcription and commits turns in the client', () => {
  const model = selectRealtimeTranscriptionModel(LIVE_TRANSCRIPTION_MODEL, true);
  assert.equal(model, LIVE_TRANSCRIPTION_MODEL);
  assert.equal(requiresClientTurnDetection(model, true), true);
});

test('an explicitly configured native transcription model is preserved', () => {
  const model = selectRealtimeTranscriptionModel('gpt-4o-transcribe', false, 'fallback-model');
  assert.equal(model, 'gpt-4o-transcribe');
  assert.equal(requiresClientTurnDetection(model, false), false);
});
