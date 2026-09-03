import assert from 'node:assert/strict';
import test from 'node:test';
import { sessionStartSchema, suggestionRequestSchema, transcriptSegmentSchema } from '@interview-copilot/contracts';
import { currentPeriodKey } from '@/lib/usage';
import { suggestionInstructions } from '@/lib/prompts';

test('session start requires affirmative consent', () => {
  const result = sessionStartSchema.safeParse({
    mode: 'behavioral', locale: 'en', retentionChoice: 'ask-at-end', deviceId: 'test-device',
    jobTargetId: 'target-1', documentIds: ['resume-1'],
    consent: { recordingAllowed: false, aiAssistanceAllowed: true, policyVersion: 'v1' },
  });
  assert.equal(result.success, false);
});

test('speaker-labeled transcript validates timestamps', () => {
  const result = transcriptSegmentSchema.parse({
    id: 'segment-1', speaker: 'interviewer', text: 'Tell me about yourself.',
    startedAtMs: 0, endedAtMs: 1200, final: true,
  });
  assert.equal(result.speaker, 'interviewer');
});

test('prompt explicitly limits claims to verified facts', () => {
  const input = suggestionRequestSchema.parse({
    question: 'What did you improve?', mode: 'behavioral', locale: 'en',
    verifiedFacts: ['Improved activation by 18% at Northstar.'], transcript: [], target: {},
  });
  const prompt = suggestionInstructions(input);
  assert.match(prompt, /Use only facts listed under VERIFIED FACTS/);
  assert.match(prompt, /Improved activation by 18%/);
});

test('prompt carries response density and prior-round consistency context', () => {
  const input = suggestionRequestSchema.parse({
    question: 'What impact did the migration have?', mode: 'behavioral', locale: 'en', responseMode: 'tiny',
    verifiedFacts: ['Reduced infrastructure cost by 22%.'], transcript: [],
    target: { interviewRound: 'Final panel', priorRoundNotes: ['Previously stated the result was 22%.'] },
  });
  const prompt = suggestionInstructions(input);
  assert.match(prompt, /no more than 35 words/i);
  assert.match(prompt, /Final panel/);
  assert.match(prompt, /Previously stated the result was 22%/);
});

test('prompt distinguishes user facts from supporting references', () => {
  const input = suggestionRequestSchema.parse({
    question: 'Explain the paper findings.', mode: 'technical', locale: 'en', verifiedFacts: [], transcript: [], target: {},
  });
  const prompt = suggestionInstructions({
    ...input,
    referenceSources: [{
      id: 'paper-1#0', documentId: 'paper-1', label: 'research.pdf', kind: 'other',
      content: 'The evaluation found a 12% reduction in latency.', score: 4,
    }],
  });
  assert.match(prompt, /do not prove that the user personally did something/i);
  assert.match(prompt, /\[paper-1#0\]/);
});

test('usage periods are UTC calendar months', () => {
  assert.equal(currentPeriodKey(new Date('2026-01-31T23:59:59Z')), '2026-01');
  assert.equal(currentPeriodKey(new Date('2026-02-01T00:00:00Z')), '2026-02');
});
