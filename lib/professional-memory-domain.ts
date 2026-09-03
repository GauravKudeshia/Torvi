import type {
  InterviewMode,
  KnowledgeClass,
  ProfessionalClaimType,
  ProfessionalSourceType,
  VerificationStatus,
} from '@interview-copilot/contracts';

export type MemoryCandidate = {
  claimId: string;
  experienceId: string;
  experienceTitle: string;
  company: string | null;
  role: string | null;
  startDate?: string | null;
  endDate?: string | null;
  claimText: string;
  claimType: ProfessionalClaimType;
  knowledgeClass: KnowledgeClass;
  verificationStatus: VerificationStatus;
  sourceType: ProfessionalSourceType;
  sourceId: string | null;
  evidenceExcerpt: string | null;
  allowedAsPersonalExperience: boolean;
  confidence: number;
  technologies: string[];
  competencies: string[];
};

export type RankedMemory = MemoryCandidate & {
  retrievalScore: number;
  scoreReasons: string[];
};

export type QuestionClassification = {
  questionType: 'conversation' | 'behavioral' | 'technical-knowledge' | 'coding' | 'system-design' | 'case' | 'role-fit' | 'ambiguous' | 'meeting' | 'other';
  requiresPersonalExperience: boolean;
  ambiguous: boolean;
};

const stopWords = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'could', 'did', 'do', 'for', 'from', 'had', 'has',
  'have', 'how', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'our', 'that', 'the', 'their', 'this',
  'to', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who', 'why', 'with', 'would', 'you', 'your',
]);

export function memoryTokens(value: string) {
  return [...new Set(value.toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+#.-]{1,}/gu) ?? [])]
    .filter((token) => !stopWords.has(token));
}

export function isAutobiographicallyAllowed(candidate: Pick<MemoryCandidate, 'knowledgeClass' | 'verificationStatus' | 'allowedAsPersonalExperience'>) {
  return candidate.knowledgeClass === 'VERIFIED_PERSONAL_FACT'
    && ['verified', 'corrected'].includes(candidate.verificationStatus)
    && candidate.allowedAsPersonalExperience;
}

export function claimStateTransition(
  current: VerificationStatus,
  action: 'confirm' | 'correct' | 'reject' | 'mark_private',
): { verificationStatus: VerificationStatus; allowedAsPersonalExperience: boolean } {
  if (action === 'mark_private') {
    return { verificationStatus: current, allowedAsPersonalExperience: ['verified', 'corrected'].includes(current) };
  }
  if (action === 'reject') return { verificationStatus: 'rejected', allowedAsPersonalExperience: false };
  if (action === 'correct') return { verificationStatus: 'corrected', allowedAsPersonalExperience: true };
  return { verificationStatus: 'verified', allowedAsPersonalExperience: true };
}

export function classifyInterviewQuestion(question: string, mode: InterviewMode): QuestionClassification {
  const normalized = question.trim().toLocaleLowerCase();
  const tokens = memoryTokens(normalized);
  const personalPattern = /\b(tell me about (?:a time|your)|describe (?:a time|your)|give me an example|walk me through (?:a time|your)|have you ever|what did you|how did you|your experience|you led|you built|you handled|you resolved)\b/i;
  const ambiguousPattern = /\b(this|that|it|things|scale it|improve it|make it better)\b/i;
  const ambiguous = tokens.length < 4 || (ambiguousPattern.test(normalized) && !/\b(traffic|data|team|organization|database|service|system)\b/i.test(normalized));
  if (mode === 'meeting') return { questionType: 'meeting', requiresPersonalExperience: false, ambiguous };
  if (['general', 'sales', 'presentation', 'negotiation'].includes(mode)) {
    return { questionType: 'conversation', requiresPersonalExperience: personalPattern.test(normalized), ambiguous };
  }
  if (ambiguous) return { questionType: 'ambiguous', requiresPersonalExperience: personalPattern.test(normalized), ambiguous: true };
  if (mode === 'behavioral' || personalPattern.test(normalized)) return { questionType: 'behavioral', requiresPersonalExperience: true, ambiguous: false };
  if (mode === 'coding') return { questionType: 'coding', requiresPersonalExperience: false, ambiguous: false };
  if (mode === 'system-design') return { questionType: 'system-design', requiresPersonalExperience: false, ambiguous: false };
  if (mode === 'case') return { questionType: 'case', requiresPersonalExperience: false, ambiguous: false };
  if (/\b(why (?:this|the) role|why (?:this|the) company|fit for|hire you|interested in)\b/i.test(normalized)) {
    return { questionType: 'role-fit', requiresPersonalExperience: true, ambiguous: false };
  }
  if (mode === 'technical' || /\b(explain|define|difference|trade-?off|architecture|algorithm|database|api)\b/i.test(normalized)) {
    return { questionType: 'technical-knowledge', requiresPersonalExperience: false, ambiguous: false };
  }
  return { questionType: 'other', requiresPersonalExperience: false, ambiguous: false };
}

export function rankProfessionalMemory(
  question: string,
  candidates: MemoryCandidate[],
  context: {
    role?: string | null;
    company?: string | null;
    jobDescription?: string | null;
    competencies?: string[];
    usedClaimIds?: string[];
    previousRoundClaimIds?: string[];
    preferredExperienceIds?: string[];
  } = {},
  limit = 8,
): RankedMemory[] {
  const queryTokens = memoryTokens(`${question} ${context.role ?? ''} ${context.jobDescription ?? ''} ${(context.competencies ?? []).join(' ')}`);
  const used = new Set(context.usedClaimIds ?? []);
  const priorRound = new Set(context.previousRoundClaimIds ?? []);
  const preferred = new Set(context.preferredExperienceIds ?? []);

  return candidates
    .filter(isAutobiographicallyAllowed)
    .map((candidate) => {
      const haystack = new Set(memoryTokens([
        candidate.experienceTitle, candidate.company ?? '', candidate.role ?? '', candidate.claimText,
        candidate.claimType, ...candidate.technologies, ...candidate.competencies,
      ].join(' ')));
      const overlap = queryTokens.reduce((score, token) => score + (haystack.has(token) ? (token.length > 7 ? 1.4 : 1) : 0), 0);
      const reasons: string[] = [];
      let score = overlap;
      if (overlap > 0) reasons.push('question relevance');
      if (context.role && memoryTokens(context.role).some((token) => haystack.has(token))) { score += 1.3; reasons.push('role relevance'); }
      if (context.company && candidate.company?.toLocaleLowerCase() === context.company.toLocaleLowerCase()) { score += 0.8; reasons.push('company match'); }
      if ((context.competencies ?? []).some((competency) => memoryTokens(competency).some((token) => haystack.has(token)))) { score += 1.4; reasons.push('competency match'); }
      if (['metric', 'outcome'].includes(candidate.claimType)) { score += 1.1; reasons.push('measurable outcome'); }
      if (candidate.evidenceExcerpt) { score += 0.45; reasons.push('source evidence'); }
      score += Math.max(0, Math.min(1, candidate.confidence)) * 0.8;
      if (preferred.has(candidate.experienceId)) { score += 1.5; reasons.push('user preferred'); }
      if (used.has(candidate.claimId)) { score -= 3.2; reasons.push('already used this session'); }
      if (priorRound.has(candidate.claimId)) { score -= 1.8; reasons.push('discussed in a previous round'); }
      if (candidate.endDate && /^\d{4}/.test(candidate.endDate)) {
        const yearsOld = Math.max(0, new Date().getUTCFullYear() - Number(candidate.endDate.slice(0, 4)));
        score += Math.max(0, 0.8 - yearsOld * 0.08);
        if (yearsOld <= 3) reasons.push('recent experience');
      }
      return { ...candidate, retrievalScore: Math.round(score * 100) / 100, scoreReasons: reasons };
    })
    .sort((left, right) => right.retrievalScore - left.retrievalScore || right.confidence - left.confidence)
    .slice(0, limit);
}

export function challengeability(
  verifiedClaimCount: number,
  unsupportedElements: string[],
  recommendation: 'answer' | 'clarify_first' | 'closest_verified_example' | 'general_answer',
) {
  let score = verifiedClaimCount ? Math.min(94, 55 + verifiedClaimCount * 12) : 42;
  score -= Math.min(45, unsupportedElements.length * 15);
  if (recommendation === 'clarify_first') score -= 8;
  if (recommendation === 'general_answer') score = Math.min(score, 55);
  if (recommendation === 'closest_verified_example') score = Math.min(score, 72);
  score = Math.max(0, Math.round(score));
  const label = verifiedClaimCount === 0
    ? (recommendation === 'general_answer' ? 'general_answer' : 'needs_verification')
    : unsupportedElements.length === 0 && score >= 75
      ? 'strongly_supported'
      : 'partially_supported';
  return {
    label: label as 'strongly_supported' | 'partially_supported' | 'general_answer' | 'needs_verification',
    score,
    reasons: [
      verifiedClaimCount ? `${verifiedClaimCount} verified ${verifiedClaimCount === 1 ? 'claim' : 'claims'}` : 'No verified personal claim',
      ...unsupportedElements.slice(0, 3).map((item) => `Needs evidence: ${item}`),
    ],
  };
}

export const defaultCoverageCompetencies = [
  'Leadership', 'System design', 'Conflict', 'Failure / learning', 'Cross-functional influence', 'Technical depth',
] as const;

export function buildEvidenceCoverage(candidates: MemoryCandidate[], requested: readonly string[] = defaultCoverageCompetencies) {
  const allowed = candidates.filter(isAutobiographicallyAllowed);
  return requested.map((competency) => {
    const competencyTokens = memoryTokens(competency);
    const matches = allowed.filter((candidate) => {
      const candidateTokens = new Set(memoryTokens(`${candidate.claimType} ${candidate.claimText} ${candidate.competencies.join(' ')}`));
      return competencyTokens.some((token) => candidateTokens.has(token))
        || (competency === 'Failure / learning' && candidate.claimType === 'failure-learning')
        || (competency === 'Cross-functional influence' && candidate.claimType === 'collaboration');
    });
    return {
      competency,
      count: matches.length,
      strength: matches.length >= 3 ? 'strong' as const : matches.length > 0 ? 'partial' as const : 'missing' as const,
      experienceIds: [...new Set(matches.map((candidate) => candidate.experienceId))].slice(0, 5),
    };
  });
}
