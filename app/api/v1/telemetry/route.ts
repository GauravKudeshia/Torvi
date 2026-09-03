import { z } from 'zod';
import { requireActor } from '@/lib/auth';
import { handleApiError, json, parseJson } from '@/lib/http';
import { anonymousAnalyticsId, structuredLog } from '@/lib/observability';
import { enforceRateLimit } from '@/lib/rate-limit';

const telemetrySchema = z.object({
  event: z.enum([
    'session.started', 'session.completed', 'transcription.failed', 'suggestion.failed', 'quota.exhausted', 'checkout.started', 'document.parsed',
    'question.detected', 'question.corrected', 'question.false_positive', 'transcription.delta', 'suggestion.first_useful', 'retrieval.completed',
    'audio.failed', 'audio.disconnected', 'connection.reconnected', 'generation.failed', 'grounding.completed', 'evidence_gap', 'answer.expanded',
    'followup.opened', 'preflight.completed', 'memory.claim_verified', 'memory.claim_prevented',
  ]),
  platform: z.enum(['web', 'macos', 'windows', 'ios', 'android']),
  durationMs: z.number().int().nonnegative().max(24 * 60 * 60 * 1000).optional(),
  appVersion: z.string().max(40).optional(),
  locale: z.enum(['en', 'es', 'fr', 'de', 'hi']).optional(),
  mode: z.enum(['general', 'meeting', 'sales', 'presentation', 'negotiation', 'behavioral', 'technical', 'coding', 'system-design', 'case', 'mock']).optional(),
  status: z.enum(['ready', 'warning', 'failed', 'success']).optional(),
  value: z.number().finite().optional(),
  count: z.number().int().nonnegative().max(100_000).optional(),
});

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(`telemetry:${actor.userId}`, 120, 60_000);
    const input = await parseJson(request, telemetrySchema);
    structuredLog(input.event, { ...input, anonymousUserId: await anonymousAnalyticsId(actor.userId) });
    return json({ accepted: true }, { status: 202 });
  } catch (error) {
    return handleApiError(error);
  }
}
