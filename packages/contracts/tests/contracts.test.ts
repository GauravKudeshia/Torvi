import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isLikelyInterviewQuestion,
  isLikelyTranscriptNoise,
  mergeTranscriptFragments,
  questionSimilarity,
  sessionStartSchema,
  suggestionRequestSchema,
  transcriptFingerprint,
  shouldReviseQuestion,
} from '../src/index';

test('requires explicit recording and AI-assistance consent', () => {
  const parsed = sessionStartSchema.safeParse({
    mode: 'behavioral', locale: 'en', deviceId: 'device-1', retentionChoice: 'ask-at-end',
    jobTargetId: 'target-1', documentIds: ['resume-1'],
    consent: { recordingAllowed: false, aiAssistanceAllowed: true, policyVersion: '2026-08-22' },
  });
  assert.equal(parsed.success, false);
});

test('accepts a grounded multilingual suggestion request', () => {
  const parsed = suggestionRequestSchema.safeParse({
    question: 'Beschreiben Sie eine schwierige Entscheidung.',
    mode: 'behavioral', locale: 'de', verifiedFacts: ['Led a six-person launch team'],
    target: { role: 'Product Manager' }, transcript: [],
  });
  assert.equal(parsed.success, true);
});

test('accepts an enabled provider id and rejects unknown providers', () => {
  const base = {
    question: 'Explain the consistency trade-off.', mode: 'system-design', locale: 'en',
    transcript: [], verifiedFacts: [], target: {},
  } as const;
  assert.equal(suggestionRequestSchema.safeParse({ ...base, provider: 'openai' }).success, true);
  assert.equal(suggestionRequestSchema.safeParse({ ...base, provider: 'unknown-provider' }).success, false);
});

test('detects interview questions across launch languages without punctuation', () => {
  assert.equal(isLikelyInterviewQuestion('Tell me about a difficult decision', 'en'), true);
  assert.equal(isLikelyInterviewQuestion('Cuéntame sobre un conflicto con tu equipo', 'es'), true);
  assert.equal(isLikelyInterviewQuestion('Pouvez-vous expliquer votre approche', 'fr'), true);
  assert.equal(isLikelyInterviewQuestion('Beschreiben Sie eine schwierige Entscheidung', 'de'), true);
  assert.equal(isLikelyInterviewQuestion('मुझे बताइए कि आपने टीम को कैसे संभाला', 'hi'), true);
  assert.equal(isLikelyInterviewQuestion('Thank you for that explanation', 'en'), false);
});

test('filters common non-speech and caption hallucinations without dropping real interview turns', () => {
  assert.equal(isLikelyTranscriptNoise('[Music]'), true);
  assert.equal(isLikelyTranscriptNoise('Thank you for watching.'), true);
  assert.equal(isLikelyTranscriptNoise('Merci d’avoir regardé'), true);
  assert.equal(isLikelyTranscriptNoise('Thank you. Could you explain the tradeoff?'), false);
});

test('coalesces growing or repeated transcript fragments into one clean question', () => {
  assert.equal(
    mergeTranscriptFragments(['Can you explain your approach', 'Can you explain your approach to caching?']),
    'Can you explain your approach to caching?',
  );
  assert.equal(
    mergeTranscriptFragments(['Walk me through the design.', 'Walk me through the design.', 'Focus on failure recovery.']),
    'Walk me through the design. Focus on failure recovery.',
  );
  assert.equal(transcriptFingerprint('  What is idempotency?! '), 'what is idempotency');
});

test('recognizes a final transcript as a correction of its partial question', () => {
  assert.ok(questionSimilarity(
    'Can you explain your approach to caching',
    'Can you explain your approach to caching and failure recovery?',
  ) > 0.9);
  assert.equal(shouldReviseQuestion(
    'Can you explain your approach to caching',
    'Can you explain your approach to caching and failure recovery?',
  ), true);
  assert.equal(shouldReviseQuestion('What is caching?', 'Tell me about a conflict.'), false);
});
