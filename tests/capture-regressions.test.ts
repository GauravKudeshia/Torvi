import assert from 'node:assert/strict';
import test from 'node:test';
import { CaptureLifecycle } from '../apps/desktop/src/capture-lifecycle';
import { hasTranscriptItem, suggestionTranscript, transcriptOffsetMs } from '../packages/sdk/src/transcript';
import { suggestionRequestSchema, type TranscriptSegment } from '../packages/contracts/src/index';
import { meetingExport, type MeetingDetail } from '../packages/sdk/src/meetings';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('long sessions send at most 80 recent transcript turns without deleting saved history', () => {
  const history: TranscriptSegment[] = Array.from({ length: 120 }, (_, i) => ({ id: String(i), speaker: 'interviewer', text: `Question ${i}`, startedAtMs: i * 1000, endedAtMs: i * 1000 + 1, final: true }));
  const recent = suggestionTranscript(history);
  assert.equal(recent.length, 80);
  assert.equal(recent[0].id, '40');
  assert.equal(recent.at(-1)?.id, '119');
  assert.equal(history.length, 120);
  assert.ok(suggestionRequestSchema.safeParse({ question: 'What next?', mode: 'meeting', locale: 'en', transcript: recent }).success);
  assert.equal(suggestionTranscript([]).length, 0);
});

test('transcript deduplication is item- and speaker-specific, not text-based', () => {
  const history: TranscriptSegment[] = [{ id: 'a', itemId: 'turn1', speaker: 'candidate', text: 'Yes', startedAtMs: 0, endedAtMs: 1, final: true }];
  assert.equal(hasTranscriptItem(history, 'candidate', 'turn1'), true);
  assert.equal(hasTranscriptItem(history, 'interviewer', 'turn1'), false);
  assert.equal(hasTranscriptItem(history, 'candidate', 'turn2'), false);
  assert.equal(hasTranscriptItem(history, 'candidate'), false);
});

test('current and legacy transcript timestamps display elapsed session time', () => {
  const start = 1_790_000_000_000;
  assert.equal(transcriptOffsetMs(start + 65_000, start), 65_000);
  assert.equal(transcriptOffsetMs(65_000, start), 65_000);
  assert.equal(transcriptOffsetMs(start - 1000, start), 0);
  assert.equal(transcriptOffsetMs(NaN, start), 0);
  const detail: MeetingDetail = { session: { id: 's', title: 'Review', mode: 'meeting', status: 'saved', startedAt: start, liveSeconds: 90 }, target: null, documents: [], report: null, captures: [], interactions: [], transcript: [{ id: 'a', speaker: 'candidate', text: 'Next steps', startedAtMs: start + 65_000, endedAtMs: start + 66_000, final: true }] };
  assert.match(meetingExport(detail), /\[01:05\] You: Next steps/);
});

test('stop waits for a late native start and cleans it before allowing a new capture', async () => {
  const lifecycle = new CaptureLifecycle();
  lifecycle.begin();
  const nativeStart = deferred<void>();
  let deviceRunning = false;
  let becameActive = false;
  let capturedSignal!: AbortSignal;
  const start = lifecycle.run(async signal => {
    capturedSignal = signal;
    await nativeStart.promise;
    deviceRunning = true;
    signal.throwIfAborted();
    becameActive = true;
  });
  const rejection = assert.rejects(start, { name: 'AbortError' });
  let cleanups = 0;
  const stop = lifecycle.stop(async () => { cleanups++; deviceRunning = false; });
  assert.equal(capturedSignal.aborted, true);
  assert.throws(() => lifecycle.begin(), /still stopping/);
  assert.equal(lifecycle.stop(async () => { cleanups++; }), stop);
  await assert.rejects(lifecycle.run(async () => undefined), { name: 'AbortError' });
  nativeStart.resolve();
  await Promise.all([stop, rejection]);
  assert.equal(deviceRunning, false);
  assert.equal(becameActive, false);
  assert.equal(cleanups, 1);
  lifecycle.begin();
  assert.equal(await lifecycle.run(async signal => !signal.aborted), true);
});

test('stop aborts reconnects and still cleans resources after a failed native start', async () => {
  const lifecycle = new CaptureLifecycle();
  lifecycle.begin();
  const nativeStart = deferred<void>();
  const native = lifecycle.run(() => nativeStart.promise);
  const failed = assert.rejects(native, /device failed/);
  const reconnect = lifecycle.run(signal => new Promise<void>((_, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true });
  }));
  const cancelled = assert.rejects(reconnect, { name: 'AbortError' });
  let cleaned = false;
  const stop = lifecycle.stop(async () => { cleaned = true; });
  nativeStart.reject(new Error('device failed'));
  await Promise.all([stop, failed, cancelled]);
  assert.equal(cleaned, true);
});

test('a network AbortError is not mistaken for the user stopping capture', async () => {
  const lifecycle = new CaptureLifecycle();
  lifecycle.begin();
  await assert.rejects(lifecycle.run(async () => { throw new DOMException('Request timed out', 'AbortError'); }), { name: 'AbortError' });
  assert.equal(lifecycle.cancelled, false);
  let cleaned = false;
  await lifecycle.stop(async () => { cleaned = true; });
  assert.equal(lifecycle.cancelled, true);
  assert.equal(cleaned, true);
});
