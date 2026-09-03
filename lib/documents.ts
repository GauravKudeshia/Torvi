import { ApiError } from './http';
import { safetyIdentifier } from './crypto';

export type ExtractedDocumentFact = {
  claim: string;
  evidence: string;
  claimType: 'responsibility' | 'technology' | 'project' | 'decision' | 'challenge' | 'tradeoff' | 'outcome' | 'metric' | 'leadership' | 'collaboration' | 'conflict' | 'failure-learning' | 'other';
  experienceTitle: string;
  company: string | null;
  role: string | null;
  technologies: string[];
  competencies: string[];
  confidence: number;
};

export type ExtractedDocument = {
  summary: string;
  facts: ExtractedDocumentFact[];
  text: string;
};

function inferredClaimType(claim: string): ExtractedDocumentFact['claimType'] {
  if (/\b(\d+(?:\.\d+)?%|increased|reduced|improved|grew|saved|revenue|latency|cost)\b/i.test(claim)) return 'metric';
  if (/\b(led|managed|mentored|hired|coached)\b/i.test(claim)) return 'leadership';
  if (/\b(collaborated|partnered|stakeholder|cross-functional)\b/i.test(claim)) return 'collaboration';
  if (/\b(designed|decided|chose|architecture|trade-?off)\b/i.test(claim)) return 'decision';
  if (/\b(built|implemented|launched|migrated|project)\b/i.test(claim)) return 'project';
  return 'other';
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function responseText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === 'string') return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = Array.isArray((item as { content?: unknown }).content) ? (item as { content: unknown[] }).content : [];
    for (const part of content) {
      if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') return (part as { text: string }).text;
    }
  }
  throw new ApiError(502, 'document_parse_failed', 'The document parser returned no content.');
}

export async function extractDocument(
  bytes: Uint8Array,
  fileName: string,
  contentType: string,
  subject: string,
  kind: 'resume' | 'job-description' | 'other',
): Promise<ExtractedDocument> {
  if (contentType === 'text/plain') {
    const text = new TextDecoder().decode(bytes).slice(0, 80_000);
    const facts = kind === 'resume'
      ? text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 20).slice(0, 40)
        .map((claim) => ({
          claim,
          evidence: claim,
          claimType: inferredClaimType(claim),
          experienceTitle: `Imported resume: ${fileName}`,
          company: null,
          role: null,
          technologies: [],
          competencies: [],
          confidence: 0.55,
        }))
      : [];
    return { summary: text.slice(0, 1_000), facts, text };
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new ApiError(503, 'document_parser_unavailable', 'Document parsing is not configured.');
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      'OpenAI-Safety-Identifier': await safetyIdentifier(subject),
    },
    body: JSON.stringify({
      model: process.env.OPENAI_DOCUMENT_MODEL ?? process.env.OPENAI_FAST_MODEL ?? 'gpt-5.6-luna',
      store: false,
      instructions: kind === 'resume'
        ? 'Extract candidate facts exactly as supported by the attached resume. Group each claim with a short experience title such as company and role or project name. A claim must have a short verbatim evidence fragment. Classify its claim type, technologies, and interview competencies only when directly present. Confidence measures extraction certainty, not truth. Do not infer seniority, skills, outcomes, dates, ownership, team size, or metrics. Every claim is proposed until the user confirms it. Return plain extracted text too, capped at 30,000 characters.'
        : 'Extract the document text faithfully for interview reference. Summarize its subject and key concepts without adding claims. The facts array must be empty because this is reference material, not verified candidate experience. Return plain extracted text too, capped at 30,000 characters.',
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: `Parse this ${kind} document for a user-controlled interview knowledge pack.` },
          { type: 'input_file', filename: fileName, file_data: `data:${contentType};base64,${bytesToBase64(bytes)}` },
        ],
      }],
      text: {
        format: {
          type: 'json_schema',
          name: 'candidate_document',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['summary', 'facts', 'text'],
            properties: {
              summary: { type: 'string' },
              facts: {
                type: 'array',
                maxItems: 80,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['claim', 'evidence', 'claimType', 'experienceTitle', 'company', 'role', 'technologies', 'competencies', 'confidence'],
                  properties: {
                    claim: { type: 'string' },
                    evidence: { type: 'string' },
                    claimType: { type: 'string', enum: ['responsibility', 'technology', 'project', 'decision', 'challenge', 'tradeoff', 'outcome', 'metric', 'leadership', 'collaboration', 'conflict', 'failure-learning', 'other'] },
                    experienceTitle: { type: 'string' },
                    company: { type: ['string', 'null'] },
                    role: { type: ['string', 'null'] },
                    technologies: { type: 'array', items: { type: 'string' }, maxItems: 30 },
                    competencies: { type: 'array', items: { type: 'string' }, maxItems: 30 },
                    confidence: { type: 'number', minimum: 0, maximum: 1 },
                  },
                },
              },
              text: { type: 'string' },
            },
          },
        },
      },
      max_output_tokens: 8_000,
    }),
  });
  if (!response.ok) {
    console.error(JSON.stringify({ level: 'error', event: 'document_parse_failed', status: response.status }));
    throw new ApiError(502, 'document_parse_failed', 'The document could not be parsed.');
  }
  try {
    const parsed = JSON.parse(responseText(await response.json() as Record<string, unknown>)) as ExtractedDocument;
    return { ...parsed, text: parsed.text.slice(0, 80_000), facts: parsed.facts.slice(0, 80) };
  } catch {
    throw new ApiError(502, 'document_parse_failed', 'The document parser returned invalid content.');
  }
}
