import type { SuggestionRequest } from '@interview-copilot/contracts';
import { challengeability, classifyInterviewQuestion } from './professional-memory-domain';

export type GeneratedGroundedAnswer = {
  questionType: 'conversation' | 'behavioral' | 'technical-knowledge' | 'coding' | 'system-design' | 'case' | 'role-fit' | 'ambiguous' | 'meeting' | 'other';
  requiresPersonalExperience: boolean;
  directAnswer: string;
  supportingPoints: string[];
  expandedAnswer: string | null;
  grounding: {
    level: 'high' | 'medium' | 'low' | 'general';
    verifiedClaimIds: string[];
    contextualSourceIds: string[];
    unsupportedElements: string[];
  };
  likelyFollowUps: Array<{
    question: string;
    type: 'technical_probe' | 'behavioral_challenge' | 'ownership_clarification' | 'metric_validation' | 'tradeoff' | 'architecture_depth' | 'failure_case' | 'alternative_solution' | 'other';
  }>;
  recommendation: 'answer' | 'clarify_first' | 'closest_verified_example' | 'general_answer';
  clarificationSuggestion: string | null;
  caution: string | null;
  sourceIds: string[];
};

export function enforceGroundingPolicy(input: SuggestionRequest, generated: GeneratedGroundedAnswer) {
  const classification = classifyInterviewQuestion(input.question, input.mode);
  const allowedClaims = new Map(input.verifiedMemory
    .filter((claim) => claim.knowledgeClass === 'VERIFIED_PERSONAL_FACT' && ['verified', 'corrected'].includes(claim.verificationStatus))
    .map((claim) => [claim.claimId, claim]));
  const allowedContext = new Set((input as SuggestionRequest & { referenceSources?: Array<{ id: string }> }).referenceSources?.map((source) => source.id) ?? []);
  const verifiedClaimIds = [...new Set(generated.grounding.verifiedClaimIds)].filter((id) => allowedClaims.has(id)).slice(0, 12);
  const contextualSourceIds = [...new Set([...generated.grounding.contextualSourceIds, ...generated.sourceIds])]
    .filter((id) => allowedContext.has(id)).slice(0, 12);
  const rejectedClaimReferences = generated.grounding.verifiedClaimIds.filter((id) => !allowedClaims.has(id));
  const unsupportedElements = [...new Set([
    ...generated.grounding.unsupportedElements,
    ...rejectedClaimReferences.map(() => 'An unverified personal claim was removed.'),
  ])].slice(0, 8);
  const hasRelevantMemory = input.verifiedMemory.some((claim) => (claim.retrievalScore ?? 0) >= 1.5);
  const hasAdjacentMemory = input.verifiedMemory.length > 0;
  let recommendation = classification.ambiguous ? 'clarify_first' as const : generated.recommendation;
  let directAnswer = generated.directAnswer.trim();
  let supportingPoints = generated.supportingPoints.slice(0, 6);
  let expandedAnswer = generated.expandedAnswer?.trim() || null;
  let caution = generated.caution;

  if (classification.requiresPersonalExperience && !hasRelevantMemory) {
    recommendation = hasAdjacentMemory ? 'closest_verified_example' : classification.ambiguous ? 'clarify_first' : 'general_answer';
    directAnswer = hasAdjacentMemory
      ? `No directly matching verified example was found. The closest real experience is ${input.verifiedMemory[0].experienceTitle}.`
      : 'No verified personal example found.';
    supportingPoints = hasAdjacentMemory
      ? [input.verifiedMemory[0].claimText, 'Connect it only if the underlying situation is genuinely comparable.', 'Otherwise, answer with a truthful general approach.']
      : ['Describe the professional approach you would take.', 'Do not present a hypothetical as past experience.', 'Add a real example to Professional Memory after the interview.'];
    expandedAnswer = generated.expandedAnswer
      ? `General approach — not a claim about your past experience: ${generated.expandedAnswer}`
      : null;
    caution = 'Personal experience is missing or not sufficiently relevant. Do not imply that the general approach already happened.';
  }

  const grounded = classification.requiresPersonalExperience
    ? verifiedClaimIds.length > 0 && unsupportedElements.length === 0 && hasRelevantMemory
    : unsupportedElements.length === 0;
  const level = classification.requiresPersonalExperience
    ? grounded && verifiedClaimIds.length >= 2 ? 'high' as const : grounded ? 'medium' as const : hasAdjacentMemory ? 'low' as const : 'general' as const
    : contextualSourceIds.length ? 'medium' as const : 'general' as const;
  const quality = challengeability(verifiedClaimIds.length, unsupportedElements, recommendation);

  return {
    ...generated,
    questionType: classification.questionType,
    requiresPersonalExperience: classification.requiresPersonalExperience,
    directAnswer,
    supportingPoints,
    expandedAnswer,
    grounding: { level, verifiedClaimIds, contextualSourceIds, unsupportedElements },
    recommendation,
    clarificationSuggestion: classification.ambiguous
      ? generated.clarificationSuggestion || 'Could you clarify which dimension you want me to focus on?'
      : generated.clarificationSuggestion,
    caution,
    grounded,
    confidence: level === 'high' ? 'high' as const : level === 'medium' ? 'medium' as const : 'low' as const,
    challengeability: quality,
    answer: directAnswer,
    bullets: supportingPoints,
    followUps: generated.likelyFollowUps.map((followUp) => followUp.question),
  };
}
