import assert from 'node:assert/strict';
import test from 'node:test';
import type { SuggestionRequest } from '@interview-copilot/contracts';
import { suggestionRequestSchema, suggestionSchema } from '@interview-copilot/contracts';
import { enforceGroundingPolicy, type GeneratedGroundedAnswer } from '@/lib/grounding';
import {
  buildEvidenceCoverage,
  challengeability,
  claimStateTransition,
  classifyInterviewQuestion,
  isAutobiographicallyAllowed,
  rankProfessionalMemory,
  type MemoryCandidate,
} from '@/lib/professional-memory-domain';

const verified: MemoryCandidate = {
  claimId: 'claim-payments',
  experienceId: 'experience-payments',
  experienceTitle: 'Payments migration',
  company: 'Northstar',
  role: 'Senior engineer',
  startDate: '2024-01',
  endDate: '2025-12',
  claimText: 'Led an idempotent Kafka migration that reduced incidents by 40%.',
  claimType: 'metric',
  knowledgeClass: 'VERIFIED_PERSONAL_FACT',
  verificationStatus: 'verified',
  sourceType: 'resume',
  sourceId: 'resume-1',
  evidenceExcerpt: 'Reduced incidents by 40%',
  allowedAsPersonalExperience: true,
  confidence: 1,
  technologies: ['Kafka'],
  competencies: ['System design', 'Leadership'],
};

const generated: GeneratedGroundedAnswer = {
  questionType: 'behavioral',
  requiresPersonalExperience: true,
  directAnswer: 'I led a payments migration.',
  supportingPoints: ['Used Kafka', 'Reduced incidents by 40%'],
  expandedAnswer: 'I led the migration and designed the idempotency strategy.',
  grounding: { level: 'high', verifiedClaimIds: ['claim-payments'], contextualSourceIds: [], unsupportedElements: [] },
  likelyFollowUps: [{ question: 'Why Kafka?', type: 'tradeoff' }],
  recommendation: 'answer',
  clarificationSuggestion: null,
  caution: null,
  sourceIds: [],
};

function request(overrides: Partial<SuggestionRequest> = {}) {
  return suggestionRequestSchema.parse({
    question: 'Tell me about a difficult system migration.',
    mode: 'behavioral', locale: 'en', responseMode: 'concise', transcript: [], verifiedFacts: [], target: {},
    verifiedMemory: [{
      claimId: verified.claimId, experienceId: verified.experienceId, experienceTitle: verified.experienceTitle,
      company: verified.company, role: verified.role, claimText: verified.claimText, claimType: verified.claimType,
      knowledgeClass: verified.knowledgeClass, verificationStatus: verified.verificationStatus, sourceType: verified.sourceType,
      sourceId: verified.sourceId, evidenceExcerpt: verified.evidenceExcerpt, retrievalScore: 8,
    }],
    ...overrides,
  });
}

test('claim lifecycle distinguishes confirmation, correction, rejection, and privacy-only updates', () => {
  assert.deepEqual(claimStateTransition('proposed', 'confirm'), { verificationStatus: 'verified', allowedAsPersonalExperience: true });
  assert.deepEqual(claimStateTransition('proposed', 'correct'), { verificationStatus: 'corrected', allowedAsPersonalExperience: true });
  assert.deepEqual(claimStateTransition('verified', 'reject'), { verificationStatus: 'rejected', allowedAsPersonalExperience: false });
  assert.deepEqual(claimStateTransition('verified', 'mark_private'), { verificationStatus: 'verified', allowedAsPersonalExperience: true });
});

test('only verified or corrected personal claims are autobiographically allowed', () => {
  assert.equal(isAutobiographicallyAllowed(verified), true);
  assert.equal(isAutobiographicallyAllowed({ ...verified, verificationStatus: 'proposed', allowedAsPersonalExperience: false }), false);
  assert.equal(isAutobiographicallyAllowed({ ...verified, verificationStatus: 'rejected', allowedAsPersonalExperience: false }), false);
  assert.equal(isAutobiographicallyAllowed({ ...verified, knowledgeClass: 'INFERENCE' }), false);
});

test('retrieval ranks relevant verified evidence and penalizes an overused story', () => {
  const leadership = { ...verified, claimId: 'claim-team', experienceId: 'experience-team', experienceTitle: 'Team launch', claimText: 'Led a cross-functional launch team.', claimType: 'leadership' as const, technologies: [] };
  const first = rankProfessionalMemory('How did you handle Kafka reliability in the payments migration?', [leadership, verified]);
  assert.equal(first[0]?.claimId, 'claim-payments');
  const penalized = rankProfessionalMemory('Tell me about leadership', [leadership, verified], { usedClaimIds: ['claim-team'] });
  assert.notEqual(penalized[0]?.claimId, 'claim-team');
});

test('coverage map reports truthful gaps instead of manufacturing evidence', () => {
  const coverage = buildEvidenceCoverage([verified], ['System design', 'Conflict']);
  assert.equal(coverage.find((item) => item.competency === 'System design')?.strength, 'partial');
  assert.equal(coverage.find((item) => item.competency === 'Conflict')?.strength, 'missing');
});

test('grounding policy preserves a verified answer and creates progressive output', () => {
  const result = enforceGroundingPolicy(request(), generated);
  assert.equal(result.grounded, true);
  assert.equal(result.directAnswer, 'I led a payments migration.');
  assert.equal(result.supportingPoints.length, 2);
  assert.match(result.expandedAnswer ?? '', /idempotency/);
  assert.equal(result.likelyFollowUps[0]?.question, 'Why Kafka?');
  assert.equal(result.challengeability.label, 'partially_supported');
  assert.equal(suggestionSchema.safeParse({ ...result, mode: 'behavioral', responseMode: 'concise', provider: 'openai', citations: [] }).success, true);
});

test('evidence gap never turns a general approach into personal history', () => {
  const result = enforceGroundingPolicy(request({ verifiedMemory: [] }), { ...generated, grounding: { ...generated.grounding, verifiedClaimIds: ['invented-claim'] } });
  assert.equal(result.grounded, false);
  assert.equal(result.recommendation, 'general_answer');
  assert.equal(result.directAnswer, 'No verified personal example found.');
  assert.match(result.expandedAnswer ?? '', /^General approach/);
  assert.deepEqual(result.grounding.verifiedClaimIds, []);
});

test('ambiguous prompts recommend a clarification while retaining a safe answer path', () => {
  assert.deepEqual(classifyInterviewQuestion('How would you scale it?', 'system-design'), {
    questionType: 'ambiguous', requiresPersonalExperience: false, ambiguous: true,
  });
  const result = enforceGroundingPolicy(request({ question: 'How would you scale it?', mode: 'system-design' }), { ...generated, requiresPersonalExperience: false });
  assert.equal(result.recommendation, 'clarify_first');
  assert.ok(result.clarificationSuggestion);
});

test('challengeability explains rather than exposing an unexplained score', () => {
  const result = challengeability(0, ['Metric not verified'], 'general_answer');
  assert.equal(result.label, 'general_answer');
  assert.ok(result.reasons.some((reason) => /No verified personal claim/i.test(reason)));
});
