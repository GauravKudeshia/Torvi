import { z } from 'zod';

export const supportedLocales = ['en', 'es', 'fr', 'de', 'hi'] as const;
export const generalCopilotModes = ['general', 'meeting', 'sales', 'presentation', 'study', 'custom', 'negotiation'] as const;
export const interviewOnlyModes = ['behavioral', 'technical', 'coding', 'system-design', 'case', 'mock'] as const;
export const interviewModes = [...generalCopilotModes, ...interviewOnlyModes] as const;
export const responseModes = ['tiny', 'concise', 'standard', 'detailed'] as const;
export const responseStyles = ['adaptive', 'bullets', 'paragraph'] as const;
export const suggestionActions = ['answer', 'regenerate', 'simplify', 'natural', 'explain', 'example', 'key-points', 'action-items', 'follow-up'] as const;
export const speakers = ['interviewer', 'candidate', 'unknown'] as const;
export const careerToolKinds = ['resume-build', 'resume-review', 'cover-letter', 'job-fit', 'career-plan'] as const;
export const applicationStatuses = ['saved', 'preparing', 'applied', 'interviewing', 'offer', 'closed'] as const;
export const aiProviderIds = ['openai', 'anthropic', 'google', 'openai-compatible', 'local'] as const;
export const verificationStatuses = ['proposed', 'verified', 'corrected', 'rejected', 'unsupported'] as const;
export const knowledgeClasses = ['VERIFIED_PERSONAL_FACT', 'CONTEXTUAL_FACT', 'GENERAL_KNOWLEDGE', 'INFERENCE', 'SUGGESTION'] as const;
export const professionalClaimTypes = ['responsibility', 'technology', 'project', 'decision', 'challenge', 'tradeoff', 'outcome', 'metric', 'leadership', 'collaboration', 'conflict', 'failure-learning', 'other'] as const;
export const professionalSourceTypes = ['resume', 'supporting_document', 'user_entry', 'mock_interview', 'interview_session', 'meeting_session', 'imported_note'] as const;
export const questionTypes = ['conversation', 'behavioral', 'technical-knowledge', 'coding', 'system-design', 'case', 'role-fit', 'ambiguous', 'meeting', 'other'] as const;
export const answerRecommendations = ['answer', 'clarify_first', 'closest_verified_example', 'general_answer'] as const;
export const groundingLevels = ['high', 'medium', 'low', 'general'] as const;
export const followUpTypes = ['technical_probe', 'behavioral_challenge', 'ownership_clarification', 'metric_validation', 'tradeoff', 'architecture_depth', 'failure_case', 'alternative_solution', 'other'] as const;
export const challengeabilityLabels = ['strongly_supported', 'partially_supported', 'general_answer', 'needs_verification'] as const;

const questionOpeners: Record<(typeof supportedLocales)[number], RegExp> = {
  en: /^(tell|describe|explain|walk|how|what|why|when|where|which|who|can|could|would|do|did|does|is|are|have|give|share)\b/i,
  es: /^(que|qué|por qué|como|cómo|cuando|cuándo|donde|dónde|quien|quién|cual|cuál|puedes|podrías|cuéntame|describe|explica|háblame)\b/i,
  fr: /^(que|qu['’]est|quoi|pourquoi|comment|quand|où|qui|quel|quelle|pouvez|pourriez|parlez|décrivez|expliquez|racontez)\b/i,
  de: /^(was|warum|wie|wann|wo|wer|welche|welcher|kannst|könnten|erzählen|beschreiben|erklären|führen)\b/i,
  hi: /^(क्या|क्यों|कैसे|कब|कहाँ|कहां|कौन|कौनसा|बताइए|बताओ|समझाइए|वर्णन|kya|kyon|kaise|kab|kahan|kaun)\b/i,
};

const questionPhrases: Record<(typeof supportedLocales)[number], RegExp> = {
  en: /\b(tell me|walk me through|could you explain|would you describe|give me an example)\b/i,
  es: /\b(cuéntame|háblame de|puedes explicar|podrías describir|dame un ejemplo)\b/i,
  fr: /\b(parlez-moi|racontez-moi|pouvez-vous expliquer|pourriez-vous décrire|donnez-moi un exemple)\b/i,
  de: /\b(erzählen sie|führen sie mich|können sie erklären|würden sie beschreiben|nennen sie ein beispiel)\b/i,
  hi: /(?:मुझे बताइए|समझाइए|एक उदाहरण दीजिए|इसके बारे में बताएं|क्या आप)/i,
};

const transcriptNoisePatterns = [
  /^[\[(]?\s*(music|applause|laughter|silence|inaudible|foreign)\s*[\])]?[.!?]*$/i,
  /^(thank you for watching|thanks for watching|please subscribe|subscribe to (?:the|this) channel)[.!?]*$/i,
  /^(gracias por ver|suscríbete al canal|merci d['’]avoir regardé|abonnez-vous à la chaîne)[.!?]*$/i,
  /^(danke fürs zuschauen|bitte abonnieren|देखने के लिए धन्यवाद)[.!?]*$/i,
];

export function normalizeSpokenText(text: string) {
  return text.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

export function transcriptFingerprint(text: string) {
  return normalizeSpokenText(text)
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, ' ')
    .trim();
}

export function questionSimilarity(left: string, right: string) {
  const leftTokens = new Set(transcriptFingerprint(left).split(' ').filter(Boolean));
  const rightTokens = new Set(transcriptFingerprint(right).split(' ').filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let shared = 0;
  leftTokens.forEach((token) => { if (rightTokens.has(token)) shared += 1; });
  return shared / Math.min(leftTokens.size, rightTokens.size);
}

export function shouldReviseQuestion(previous: string, next: string) {
  const previousKey = transcriptFingerprint(previous);
  const nextKey = transcriptFingerprint(next);
  if (!previousKey || !nextKey || previousKey === nextKey) return false;
  return questionSimilarity(previousKey, nextKey) >= 0.72
    && nextKey.split(' ').length >= previousKey.split(' ').length + 2;
}

export function isLikelyTranscriptNoise(text: string) {
  const normalized = normalizeSpokenText(text);
  return !normalized || transcriptNoisePatterns.some((pattern) => pattern.test(normalized));
}

export function mergeTranscriptFragments(fragments: string[]) {
  const merged: string[] = [];
  for (const rawFragment of fragments) {
    const fragment = normalizeSpokenText(rawFragment);
    if (!fragment) continue;
    const previous = merged.at(-1);
    if (!previous) {
      merged.push(fragment);
      continue;
    }
    const previousKey = transcriptFingerprint(previous);
    const fragmentKey = transcriptFingerprint(fragment);
    if (!fragmentKey || fragmentKey === previousKey || previousKey.endsWith(fragmentKey)) continue;
    if (fragmentKey.startsWith(previousKey)) merged[merged.length - 1] = fragment;
    else merged.push(fragment);
  }
  return merged.join(' ').replace(/\s+([,.!?;:])/g, '$1');
}

export function isLikelyInterviewQuestion(text: string, locale: (typeof supportedLocales)[number] = 'en') {
  const normalized = normalizeSpokenText(text);
  if (!normalized) return false;
  return /[?？]$/.test(normalized)
    || questionOpeners[locale].test(normalized)
    || questionPhrases[locale].test(normalized);
}

export function modeRequiresVerifiedResume(mode: string) {
  return (interviewOnlyModes as readonly string[]).includes(mode);
}

export const transcriptSegmentSchema = z.object({
  id: z.string().min(1).max(128),
  speaker: z.enum(speakers),
  text: z.string().trim().min(1).max(12_000),
  startedAtMs: z.number().int().nonnegative(),
  endedAtMs: z.number().int().nonnegative(),
  final: z.boolean().default(true),
  itemId: z.string().max(128).optional(),
});

export const sessionStartSchema = z.object({
  mode: z.enum(interviewModes),
  locale: z.enum(supportedLocales),
  jobTargetId: z.string().min(1).max(128),
  documentIds: z.array(z.string().min(1).max(128)).max(12),
  retentionChoice: z.enum(['ask-at-end', 'save', 'discard']).default('ask-at-end'),
  consent: z.object({
    recordingAllowed: z.literal(true),
    aiAssistanceAllowed: z.literal(true),
    policyVersion: z.string().min(1).max(32),
  }),
  deviceId: z.string().min(1).max(128),
}).superRefine((value, context) => {
  if (modeRequiresVerifiedResume(value.mode) && value.documentIds.length === 0) {
    context.addIssue({ code: 'custom', path: ['documentIds'], message: 'Interview sessions require a verified resume.' });
  }
});

export const suggestionRequestSchema = z.object({
  question: z.string().trim().min(2).max(8_000),
  screenContext: z.string().trim().max(12_000).optional(),
  mode: z.enum(interviewModes),
  locale: z.enum(supportedLocales),
  responseMode: z.enum(responseModes).default('concise'),
  responseStyle: z.enum(responseStyles).default('adaptive'),
  action: z.enum(suggestionActions).default('answer'),
  provider: z.enum(aiProviderIds).optional(),
  transcript: z.array(transcriptSegmentSchema).max(80).default([]),
  verifiedFacts: z.array(z.string().trim().min(1).max(800)).max(80).default([]),
  verifiedMemory: z.array(z.object({
    claimId: z.string().min(1).max(128),
    experienceId: z.string().min(1).max(128),
    experienceTitle: z.string().min(1).max(240),
    company: z.string().max(180).nullable().optional(),
    role: z.string().max(180).nullable().optional(),
    claimText: z.string().min(1).max(1_200),
    claimType: z.enum(professionalClaimTypes),
    knowledgeClass: z.enum(knowledgeClasses),
    verificationStatus: z.enum(verificationStatuses),
    sourceType: z.enum(professionalSourceTypes),
    sourceId: z.string().max(128).nullable().optional(),
    evidenceExcerpt: z.string().max(1_000).nullable().optional(),
    retrievalScore: z.number().optional(),
  })).max(16).default([]),
  communicationProfile: z.object({
    preferredAnswerLength: z.enum(responseModes),
    technicalDepth: z.enum(['brief', 'balanced', 'deep']),
    tone: z.enum(['conversational', 'formal', 'executive', 'warm']),
    firstPersonStyle: z.enum(['direct', 'reflective', 'team_forward']),
    bulletPreference: z.enum(['progressive', 'bullets', 'narrative']),
    explanationDepth: z.enum(['adaptive', 'short', 'detailed']),
    vocabularyPreferences: z.array(z.string().trim().min(1).max(80)).max(30),
  }).optional(),
  target: z.object({
    role: z.string().max(180).optional(),
    company: z.string().max(180).optional(),
    jobDescription: z.string().max(20_000).optional(),
    interviewer: z.string().max(180).optional(),
    interviewRound: z.string().max(180).optional(),
    objective: z.string().max(500).optional(),
    priorRoundNotes: z.array(z.string().trim().min(1).max(180)).max(20).optional(),
  }).default({}),
});

export const professionalClaimSchema = z.object({
  id: z.string().min(1).max(128),
  experienceId: z.string().min(1).max(128).nullable(),
  claimText: z.string().min(1).max(1_200),
  claimType: z.enum(professionalClaimTypes),
  knowledgeClass: z.enum(knowledgeClasses),
  sourceType: z.enum(professionalSourceTypes),
  sourceId: z.string().max(128).nullable(),
  sourceExcerpt: z.string().max(2_000).nullable(),
  sourceLocation: z.string().max(500).nullable(),
  verificationStatus: z.enum(verificationStatuses),
  verifiedAt: z.number().int().nullable(),
  userCorrection: z.string().max(1_200).nullable(),
  confidence: z.number().min(0).max(1),
  allowedAsPersonalExperience: z.boolean(),
  sensitive: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export const professionalExperienceSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(240),
  company: z.string().max(180).nullable(),
  role: z.string().max(180).nullable(),
  startDate: z.string().max(40).nullable(),
  endDate: z.string().max(40).nullable(),
  context: z.string().max(4_000).nullable(),
  summary: z.string().max(4_000).nullable(),
  technologies: z.array(z.string().max(120)).max(50),
  competencies: z.array(z.string().max(120)).max(50),
  verificationStatus: z.enum(verificationStatuses),
  confidence: z.number().min(0).max(1),
  sensitive: z.boolean(),
  claims: z.array(professionalClaimSchema),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export const professionalClaimActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('confirm') }),
  z.object({ action: z.literal('correct'), claimText: z.string().trim().min(1).max(1_200) }),
  z.object({ action: z.literal('reject') }),
  z.object({ action: z.literal('mark_private'), sensitive: z.boolean() }),
]);

export const communicationProfileSchema = z.object({
  preferredAnswerLength: z.enum(responseModes).default('concise'),
  technicalDepth: z.enum(['brief', 'balanced', 'deep']).default('balanced'),
  tone: z.enum(['conversational', 'formal', 'executive', 'warm']).default('conversational'),
  firstPersonStyle: z.enum(['direct', 'reflective', 'team_forward']).default('direct'),
  bulletPreference: z.enum(['progressive', 'bullets', 'narrative']).default('progressive'),
  explanationDepth: z.enum(['adaptive', 'short', 'detailed']).default('adaptive'),
  vocabularyPreferences: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
});

export const suggestionSchema = z.object({
  answer: z.string(),
  bullets: z.array(z.string()).max(6),
  followUps: z.array(z.string()).max(4),
  questionType: z.enum(questionTypes).default('other'),
  requiresPersonalExperience: z.boolean().default(false),
  directAnswer: z.string().default(''),
  supportingPoints: z.array(z.string()).max(6).default([]),
  expandedAnswer: z.string().nullable().default(null),
  grounding: z.object({
    level: z.enum(groundingLevels),
    verifiedClaimIds: z.array(z.string().min(1).max(128)).max(12),
    contextualSourceIds: z.array(z.string().min(1).max(128)).max(12),
    unsupportedElements: z.array(z.string().max(500)).max(8),
  }).default({ level: 'general', verifiedClaimIds: [], contextualSourceIds: [], unsupportedElements: [] }),
  likelyFollowUps: z.array(z.object({
    question: z.string().min(1).max(800),
    type: z.enum(followUpTypes),
  })).max(3).default([]),
  recommendation: z.enum(answerRecommendations).default('answer'),
  clarificationSuggestion: z.string().max(800).nullable().default(null),
  challengeability: z.object({
    label: z.enum(challengeabilityLabels),
    score: z.number().min(0).max(100),
    reasons: z.array(z.string().max(400)).max(6),
  }).default({ label: 'general_answer', score: 50, reasons: [] }),
  confidence: z.enum(['low', 'medium', 'high']),
  grounded: z.boolean(),
  mode: z.enum(interviewModes),
  responseMode: z.enum(responseModes),
  provider: z.enum(aiProviderIds).default('openai'),
  caution: z.string().nullable(),
  citations: z.array(z.object({
    documentId: z.string().min(1).max(128),
    label: z.string().min(1).max(240),
    kind: z.enum(['resume', 'job-description', 'other']),
    excerpt: z.string().min(1).max(500),
  })).max(6).default([]),
});

export const careerToolRequestSchema = z.object({
  kind: z.enum(careerToolKinds),
  locale: z.enum(supportedLocales).default('en'),
  role: z.string().trim().max(180).optional(),
  company: z.string().trim().max(180).optional(),
  jobDescription: z.string().trim().max(30_000).optional(),
  sourceText: z.string().trim().max(30_000).optional(),
  prompt: z.string().trim().max(4_000).optional(),
  tone: z.enum(['concise', 'confident', 'warm', 'executive']).default('confident'),
});

export const careerArtifactSchema = z.object({
  title: z.string().min(1).max(180),
  content: z.string().min(1).max(30_000),
  bullets: z.array(z.string().min(1).max(800)).max(12),
  keywords: z.array(z.string().min(1).max(120)).max(20),
  score: z.number().min(0).max(100).nullable(),
  caution: z.string().max(1_000).nullable(),
});

export const jobApplicationCreateSchema = z.object({
  role: z.string().trim().min(1).max(180),
  company: z.string().trim().min(1).max(180),
  jobUrl: z.string().url().max(2_000).nullable().optional(),
  jobDescription: z.string().trim().max(30_000).nullable().optional(),
  notes: z.string().trim().max(8_000).nullable().optional(),
  status: z.enum(applicationStatuses).default('saved'),
});

export const jobApplicationUpdateSchema = z.object({
  status: z.enum(applicationStatuses).optional(),
  notes: z.string().trim().max(8_000).nullable().optional(),
  nextAction: z.string().trim().max(500).nullable().optional(),
  matchScore: z.number().int().min(0).max(100).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

export type SupportedLocale = (typeof supportedLocales)[number];
export type InterviewMode = (typeof interviewModes)[number];
export type ResponseMode = (typeof responseModes)[number];
export type ResponseStyle = (typeof responseStyles)[number];
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;
export type SessionStartRequest = z.infer<typeof sessionStartSchema>;
export type SuggestionRequest = z.infer<typeof suggestionRequestSchema>;
export type Suggestion = z.infer<typeof suggestionSchema>;
export type ProfessionalClaim = z.infer<typeof professionalClaimSchema>;
export type ProfessionalExperience = z.infer<typeof professionalExperienceSchema>;
export type ProfessionalClaimAction = z.infer<typeof professionalClaimActionSchema>;
export type CommunicationProfile = z.infer<typeof communicationProfileSchema>;
export type VerificationStatus = (typeof verificationStatuses)[number];
export type KnowledgeClass = (typeof knowledgeClasses)[number];
export type ProfessionalClaimType = (typeof professionalClaimTypes)[number];
export type ProfessionalSourceType = (typeof professionalSourceTypes)[number];
export type CareerToolKind = (typeof careerToolKinds)[number];
export type CareerToolRequest = z.infer<typeof careerToolRequestSchema>;
export type CareerArtifact = z.infer<typeof careerArtifactSchema>;
export type JobApplicationCreate = z.infer<typeof jobApplicationCreateSchema>;
export type JobApplicationUpdate = z.infer<typeof jobApplicationUpdateSchema>;
export type AiProviderId = (typeof aiProviderIds)[number];

export type AiProviderDescriptor = {
  id: AiProviderId;
  label: string;
  enabled: boolean;
  capabilities: Array<'suggestions' | 'reports' | 'vision' | 'realtime-transcription'>;
  configuration: 'managed' | 'bring-your-own-key' | 'local';
};

export type RealtimeEvent =
  | { type: 'transcript.delta'; itemId: string; delta: string; speaker: z.infer<typeof transcriptSegmentSchema>['speaker'] }
  | { type: 'transcript.final'; segment: TranscriptSegment }
  | { type: 'question.detected'; itemId: string; question: string }
  | { type: 'suggestion.started'; requestId: string }
  | { type: 'suggestion.delta'; requestId: string; delta: string }
  | { type: 'suggestion.final'; requestId: string; suggestion: Suggestion }
  | { type: 'quota.warning'; remainingMinutes: number }
  | { type: 'permission.lost'; permission: 'microphone' | 'system-audio' | 'screen' }
  | { type: 'connection.reconnecting'; attempt: number }
  | { type: 'session.error'; code: string; recoverable: boolean; message: string };

export const FREE_LIVE_MINUTES = 15;
export const PRO_LIVE_MINUTES = 300;
export const FREE_MOCK_SESSIONS = 3;
