import assert from 'node:assert/strict';
import test from 'node:test';
import { detectRoundConcerns } from '@/lib/interview-memory';

test('round debrief proposes reviewable concerns from saved speaker-labeled turns', () => {
  const concerns = detectRoundConcerns([
    { id: '1', speaker: 'interviewer', text: 'Tell me about Kubernetes depth.', startedAtMs: 0, endedAtMs: 10, final: true },
    { id: '2', speaker: 'candidate', text: "I am not familiar with Kubernetes in production.", startedAtMs: 11, endedAtMs: 20, final: true },
    { id: '3', speaker: 'candidate', text: 'The team improved reliability significantly.', startedAtMs: 21, endedAtMs: 30, final: true },
  ]);
  assert.ok(concerns.some((concern) => concern.category === 'knowledge_gap'));
  assert.ok(concerns.some((concern) => concern.category === 'ownership_clarity'));
  assert.ok(concerns.some((concern) => concern.category === 'weak_metric'));
});

test('concern detector does not emit raw audio artifacts', () => {
  const concerns = detectRoundConcerns([]);
  assert.deepEqual(concerns, []);
});
