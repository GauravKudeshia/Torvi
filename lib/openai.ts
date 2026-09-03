import { z } from 'zod';
import type { CareerArtifact, CareerToolRequest, InterviewMode, Suggestion, SuggestionRequest, TranscriptSegment } from '@interview-copilot/contracts';
import { careerArtifactSchema, suggestionSchema } from '@interview-copilot/contracts';
import { ApiError } from './http';
import { careerToolInstructions, reportInstructions, suggestionInstructions } from './prompts';
import { safetyIdentifier } from './crypto';
import type { ReferenceSource } from './retrieval';
import { enforceGroundingPolicy } from './grounding';

const suggestionJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['questionType', 'requiresPersonalExperience', 'directAnswer', 'supportingPoints', 'expandedAnswer', 'grounding', 'likelyFollowUps', 'recommendation', 'clarificationSuggestion', 'caution', 'sourceIds'],
  properties: {
    questionType: { type: 'string', enum: ['conversation', 'behavioral', 'technical-knowledge', 'coding', 'system-design', 'case', 'role-fit', 'ambiguous', 'meeting', 'other'] },
    requiresPersonalExperience: { type: 'boolean' },
    directAnswer: { type: 'string' },
    supportingPoints: { type: 'array', items: { type: 'string' }, maxItems: 6 },
    expandedAnswer: { type: ['string', 'null'] },
    grounding: {
      type: 'object', additionalProperties: false,
      required: ['level', 'verifiedClaimIds', 'contextualSourceIds', 'unsupportedElements'],
      properties: {
        level: { type: 'string', enum: ['high', 'medium', 'low', 'general'] },
        verifiedClaimIds: { type: 'array', items: { type: 'string' }, maxItems: 12 },
        contextualSourceIds: { type: 'array', items: { type: 'string' }, maxItems: 12 },
        unsupportedElements: { type: 'array', items: { type: 'string' }, maxItems: 8 },
      },
    },
    likelyFollowUps: {
      type: 'array', maxItems: 3,
      items: {
        type: 'object', additionalProperties: false, required: ['question', 'type'],
        properties: {
          question: { type: 'string' },
          type: { type: 'string', enum: ['technical_probe', 'behavioral_challenge', 'ownership_clarification', 'metric_validation', 'tradeoff', 'architecture_depth', 'failure_case', 'alternative_solution', 'other'] },
        },
      },
    },
    recommendation: { type: 'string', enum: ['answer', 'clarify_first', 'closest_verified_example', 'general_answer'] },
    clarificationSuggestion: { type: ['string', 'null'] },
    caution: { type: ['string', 'null'] },
    sourceIds: { type: 'array', items: { type: 'string' }, maxItems: 6 },
  },
} as const;

const rawSuggestionSchema = z.object({
  questionType: z.enum(['conversation', 'behavioral', 'technical-knowledge', 'coding', 'system-design', 'case', 'role-fit', 'ambiguous', 'meeting', 'other']),
  requiresPersonalExperience: z.boolean(),
  directAnswer: z.string(),
  supportingPoints: z.array(z.string()).max(6),
  expandedAnswer: z.string().nullable(),
  grounding: z.object({
    level: z.enum(['high', 'medium', 'low', 'general']),
    verifiedClaimIds: z.array(z.string()).max(12),
    contextualSourceIds: z.array(z.string()).max(12),
    unsupportedElements: z.array(z.string()).max(8),
  }),
  likelyFollowUps: z.array(z.object({
    question: z.string(),
    type: z.enum(['technical_probe', 'behavioral_challenge', 'ownership_clarification', 'metric_validation', 'tradeoff', 'architecture_depth', 'failure_case', 'alternative_solution', 'other']),
  })).max(3),
  recommendation: z.enum(['answer', 'clarify_first', 'closest_verified_example', 'general_answer']),
  clarificationSuggestion: z.string().nullable(),
  caution: z.string().nullable(),
  sourceIds: z.array(z.string()).max(6),
});

const careerArtifactJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'content', 'bullets', 'keywords', 'score', 'caution'],
  properties: {
    title: { type: 'string' },
    content: { type: 'string' },
    bullets: { type: 'array', items: { type: 'string' }, maxItems: 12 },
    keywords: { type: 'array', items: { type: 'string' }, maxItems: 20 },
    score: { type: ['number', 'null'], minimum: 0, maximum: 100 },
    caution: { type: ['string', 'null'] },
  },
} as const;

const sessionReportSchema = z.object({
  score: z.number().min(0).max(100),
  summary: z.string().min(1).max(4_000),
  strengths: z.array(z.string().min(1).max(500)).max(8),
  improvements: z.array(z.string().min(1).max(500)).max(8),
  notes: z.array(z.string().min(1).max(800)).max(12),
  actionItems: z.array(z.string().min(1).max(800)).max(10),
  followUpEmail: z.string().min(1).max(6_000),
});

const sessionReportJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'summary', 'strengths', 'improvements', 'notes', 'actionItems', 'followUpEmail'],
  properties: {
    score: { type: 'number', minimum: 0, maximum: 100 },
    summary: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    improvements: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    notes: { type: 'array', items: { type: 'string' }, maxItems: 12 },
    actionItems: { type: 'array', items: { type: 'string' }, maxItems: 10 },
    followUpEmail: { type: 'string' },
  },
} as const;

export type SessionReportResult = z.infer<typeof sessionReportSchema>;

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new ApiError(503, 'ai_not_configured', 'AI is not configured on this environment.');
  return key;
}

export function modelForMode(mode: InterviewMode): string {
  return ['coding', 'system-design', 'case'].includes(mode)
    ? (process.env.OPENAI_STRONG_MODEL ?? 'gpt-5.6-terra')
    : (process.env.OPENAI_FAST_MODEL ?? 'gpt-5.6-luna');
}

type SuggestionInput = SuggestionRequest & { referenceSources: ReferenceSource[] };
type SuggestionResult = { suggestion: Suggestion; model: string };

function suggestionRequestBody(input: SuggestionInput, model: string, stream = false) {
  return {
    model,
    store: false,
    instructions: suggestionInstructions(input),
    input: [{ role: 'user', content: [{ type: 'input_text', text: `Live conversation request: ${input.question}` }] }],
    text: { format: { type: 'json_schema', name: 'copilot_suggestion', strict: true, schema: suggestionJsonSchema } },
    max_output_tokens: 900,
    ...(stream ? { stream: true, stream_options: { include_obfuscation: false } } : {}),
  };
}

function responseText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === 'string') return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = Array.isArray((item as { content?: unknown }).content) ? (item as { content: unknown[] }).content : [];
    for (const part of content) {
      if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
        return (part as { text: string }).text;
      }
    }
  }
  throw new ApiError(502, 'empty_ai_response', 'The AI service returned no answer.');
}

function finalizeSuggestion(input: SuggestionInput, outputText: string, model: string): SuggestionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new ApiError(502, 'invalid_ai_response', 'The coaching service returned an invalid answer.');
  }
  const rawSuggestion = rawSuggestionSchema.safeParse(parsed);
  if (!rawSuggestion.success) throw new ApiError(502, 'invalid_ai_response', 'The coaching service returned an invalid answer shape.');
  const policyResult = enforceGroundingPolicy(input, rawSuggestion.data);
  const allowedSources = new Map(input.referenceSources.map((source) => [source.id, source]));
  const citedDocuments = new Set<string>();
  const citations = policyResult.grounding.contextualSourceIds.flatMap((sourceId) => {
    const source = allowedSources.get(sourceId);
    if (!source || citedDocuments.has(source.documentId)) return [];
    citedDocuments.add(source.documentId);
    return [{
      documentId: source.documentId,
      label: source.label,
      kind: source.kind,
      excerpt: source.content.replace(/\s+/g, ' ').slice(0, 360),
    }];
  });
  const suggestion = suggestionSchema.safeParse({
    ...policyResult,
    mode: input.mode,
    responseMode: input.responseMode,
    provider: input.provider ?? 'openai',
    citations,
  });
  if (!suggestion.success) throw new ApiError(502, 'invalid_ai_response', 'The coaching service returned an invalid grounded answer shape.');
  return { suggestion: suggestion.data, model };
}

export function extractStreamingJsonString(input: string, key: string): { value: string; complete: boolean } | null {
  const marker = `"${key}"`;
  const markerIndex = input.indexOf(marker);
  if (markerIndex < 0) return null;
  const colonIndex = input.indexOf(':', markerIndex + marker.length);
  if (colonIndex < 0) return null;
  let start = colonIndex + 1;
  while (/\s/.test(input[start] ?? '')) start += 1;
  if (input[start] !== '"') return null;
  start += 1;
  let escaped = false;
  let end = start;
  for (; end < input.length; end += 1) {
    const character = input[end];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '"') break;
  }
  const encoded = input.slice(start, end);
  try {
    return { value: JSON.parse(`"${encoded}"`) as string, complete: end < input.length };
  } catch {
    // A stream may split a JSON escape (for example, midway through \u2019).
    // Keep the last decodable value on screen until the next delta completes it.
    return null;
  }
}

async function openSuggestionResponse(input: SuggestionInput, subject: string, stream: boolean, signal?: AbortSignal) {
  const model = modelForMode(input.mode);
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey()}`,
      'content-type': 'application/json',
      'OpenAI-Safety-Identifier': await safetyIdentifier(subject),
    },
    body: JSON.stringify(suggestionRequestBody(input, model, stream)),
    signal,
  });
  if (!response.ok) {
    const body = await response.text();
    console.error(JSON.stringify({ level: 'error', event: 'openai_response_failed', status: response.status, body: body.slice(0, 500) }));
    throw new ApiError(502, 'ai_unavailable', 'The coaching service is temporarily unavailable.');
  }
  return { model, response };
}

export async function createSuggestion(input: SuggestionInput, subject: string): Promise<SuggestionResult> {
  const { model, response } = await openSuggestionResponse(input, subject, false);
  return finalizeSuggestion(input, responseText(await response.json() as Record<string, unknown>), model);
}

export async function streamSuggestion(
  input: SuggestionInput,
  subject: string,
  onDirectAnswerDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<SuggestionResult> {
  const { model, response } = await openSuggestionResponse(input, subject, true, signal);
  if (!response.body) throw new ApiError(502, 'empty_ai_response', 'The AI service returned no answer stream.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let eventBuffer = '';
  let outputText = '';
  let emittedDirectAnswer = '';

  const consumeEvent = (block: string) => {
    const data = block.split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data || data === '[DONE]') return;
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(data) as Record<string, unknown>; } catch { return; }
    if (payload.type === 'response.output_text.delta' && typeof payload.delta === 'string') {
      outputText += payload.delta;
      const directAnswer = extractStreamingJsonString(outputText, 'directAnswer');
      if (directAnswer && directAnswer.value.startsWith(emittedDirectAnswer)) {
        const nextDelta = directAnswer.value.slice(emittedDirectAnswer.length);
        if (nextDelta) {
          emittedDirectAnswer = directAnswer.value;
          onDirectAnswerDelta(nextDelta);
        }
      }
    }
    if (payload.type === 'response.failed' || payload.type === 'error') {
      throw new ApiError(502, 'ai_unavailable', 'The coaching service could not complete this answer.');
    }
  };

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    eventBuffer += decoder.decode(chunk.value, { stream: true });
    const blocks = eventBuffer.split(/\r?\n\r?\n/);
    eventBuffer = blocks.pop() ?? '';
    for (const block of blocks) consumeEvent(block);
  }
  eventBuffer += decoder.decode();
  if (eventBuffer.trim()) consumeEvent(eventBuffer);
  if (!outputText) throw new ApiError(502, 'empty_ai_response', 'The AI service returned no answer.');
  return finalizeSuggestion(input, outputText, model);
}

export async function createCareerArtifact(
  input: CareerToolRequest,
  verifiedFacts: string[],
  subject: string,
): Promise<{ artifact: CareerArtifact; model: string }> {
  const model = ['resume-build', 'resume-review', 'job-fit'].includes(input.kind)
    ? (process.env.OPENAI_STRONG_MODEL ?? 'gpt-5.6-terra')
    : (process.env.OPENAI_FAST_MODEL ?? 'gpt-5.6-luna');
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey()}`,
      'content-type': 'application/json',
      'OpenAI-Safety-Identifier': await safetyIdentifier(subject),
    },
    body: JSON.stringify({
      model,
      store: false,
      instructions: careerToolInstructions(input, verifiedFacts),
      input: [{ role: 'user', content: [{ type: 'input_text', text: input.prompt || 'Create the requested career artifact.' }] }],
      text: { format: { type: 'json_schema', name: 'career_artifact', strict: true, schema: careerArtifactJsonSchema } },
      max_output_tokens: 2_400,
    }),
  });
  if (!response.ok) throw new ApiError(502, 'ai_unavailable', 'The career tool is temporarily unavailable.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText(await response.json() as Record<string, unknown>));
  } catch {
    throw new ApiError(502, 'invalid_ai_response', 'The career tool returned an invalid response.');
  }
  const artifact = careerArtifactSchema.safeParse(parsed);
  if (!artifact.success) throw new ApiError(502, 'invalid_ai_response', 'The career tool returned an invalid response shape.');
  return { artifact: artifact.data, model };
}

export async function createSessionReport(
  locale: string,
  mode: InterviewMode,
  segments: TranscriptSegment[],
  verifiedFacts: string[],
  subject: string,
): Promise<SessionReportResult> {
  const transcript = segments
    .map((segment) => `${segment.speaker.toUpperCase()}: ${segment.text}`)
    .join('\n')
    .slice(0, 60_000);
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey()}`,
      'content-type': 'application/json',
      'OpenAI-Safety-Identifier': await safetyIdentifier(subject),
    },
    body: JSON.stringify({
      model: process.env.OPENAI_REPORT_MODEL ?? process.env.OPENAI_FAST_MODEL ?? 'gpt-5.6-luna',
      store: false,
      instructions: reportInstructions(locale, mode),
      input: [{
        role: 'user',
        content: [{
          type: 'input_text',
          text: `VERIFIED FACTS:\n${verifiedFacts.join('\n') || 'None supplied'}\n\nTRANSCRIPT:\n${transcript}`,
        }],
      }],
      text: { format: { type: 'json_schema', name: 'session_report', strict: true, schema: sessionReportJsonSchema } },
      max_output_tokens: 1_800,
    }),
  });
  if (!response.ok) throw new ApiError(502, 'report_unavailable', 'The AI report service is temporarily unavailable.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText(await response.json() as Record<string, unknown>));
  } catch {
    throw new ApiError(502, 'invalid_ai_response', 'The report service returned an invalid response.');
  }
  const report = sessionReportSchema.safeParse(parsed);
  if (!report.success) throw new ApiError(502, 'invalid_ai_response', 'The report service returned an invalid response shape.');
  return report.data;
}

export async function analyzeScreen(image: File, mode: InterviewMode, subject: string): Promise<string> {
  if (image.size > 5 * 1024 * 1024) throw new ApiError(413, 'image_too_large', 'Screen context must be 5 MB or smaller.');
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(image.type)) throw new ApiError(415, 'unsupported_image', 'Use PNG, JPEG, or WebP.');
  const data = new Uint8Array(await image.arrayBuffer());
  let binary = '';
  for (let index = 0; index < data.length; index += 0x8000) {
    binary += String.fromCharCode(...data.subarray(index, index + 0x8000));
  }
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey()}`,
      'content-type': 'application/json',
      'OpenAI-Safety-Identifier': await safetyIdentifier(subject),
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL ?? process.env.OPENAI_STRONG_MODEL ?? 'gpt-5.6-terra',
      store: false,
      instructions: 'Analyze only the visible content that is relevant to the user\'s current conversation or task. Give a concise answer, key observations, and likely pitfalls. Do not identify people or infer sensitive traits. The screenshot is transient and must not be described as stored.',
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: `Copilot mode: ${mode}` },
          { type: 'input_image', image_url: `data:${image.type};base64,${btoa(binary)}`, detail: 'high' },
        ],
      }],
      max_output_tokens: 700,
    }),
  });
  if (!response.ok) throw new ApiError(502, 'vision_unavailable', 'Screen analysis is temporarily unavailable.');
  return responseText(await response.json() as Record<string, unknown>);
}
