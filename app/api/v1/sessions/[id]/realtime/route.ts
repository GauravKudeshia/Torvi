import { z } from 'zod';
import { getDb } from '@/db';
import { sessions } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { safetyIdentifier } from '@/lib/crypto';
import { ApiError, handleApiError, json, parseJson } from '@/lib/http';
import { ownedSession } from '@/lib/session';
import { quotaFor } from '@/lib/usage';
import { eq } from 'drizzle-orm';
import { enforceRateLimit } from '@/lib/rate-limit';
import {
  LIVE_TRANSCRIPTION_MODEL,
  requiresClientTurnDetection,
  selectRealtimeTranscriptionModel,
} from '@/lib/realtime';

const realtimeInitSchema = z.object({
  channel: z.enum(['interviewer', 'candidate']).default('interviewer'),
  clientTurnDetection: z.boolean().default(false),
});

const clientSecretSchema = z.object({
  value: z.string().min(20),
  expires_at: z.number().optional(),
});

const languageCodes: Record<string, string> = { en: 'en', es: 'es', fr: 'fr', de: 'de', hi: 'hi' };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(`realtime-init:${actor.userId}`, 20, 60_000);
    const { id } = await context.params;
    const session = await ownedSession(id, actor.userId);
    if (['discarded', 'saved'].includes(session.status)) throw new ApiError(409, 'session_closed', 'This session is already closed.');
    const quota = await quotaFor(getDb(), actor.userId);
    if (quota.remainingLiveSeconds <= 0 && session.mode !== 'mock') throw new ApiError(402, 'live_quota_exhausted', 'Your monthly live quota is exhausted.');
    const input = await parseJson(request, realtimeInitSchema);
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new ApiError(503, 'ai_not_configured', 'Realtime coaching is not configured.');
    const configuredModel = process.env.OPENAI_TRANSCRIBE_MODEL ?? LIVE_TRANSCRIPTION_MODEL;
    const transcriptionModel = selectRealtimeTranscriptionModel(
      configuredModel,
      input.clientTurnDetection,
      process.env.OPENAI_VAD_TRANSCRIBE_MODEL,
    );
    const language = languageCodes[session.locale] ?? 'en';
    const liveTranscription = transcriptionModel === LIVE_TRANSCRIPTION_MODEL;
    const clientTurnDetection = requiresClientTurnDetection(transcriptionModel, input.clientTurnDetection);

    const upstream = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        'OpenAI-Safety-Identifier': await safetyIdentifier(actor.subject),
      },
      body: JSON.stringify({
        session: {
          type: 'transcription',
          audio: {
            input: {
              format: { type: 'audio/pcm', rate: 24000 },
              noise_reduction: input.channel === 'candidate' ? { type: 'near_field' } : null,
              transcription: liveTranscription
                ? { model: transcriptionModel, languages: [language], delay: 'low' }
                : { model: transcriptionModel, language },
              turn_detection: clientTurnDetection
                ? null
                : input.channel === 'interviewer'
                  ? { type: 'semantic_vad', eagerness: 'high', create_response: false, interrupt_response: false }
                  : { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 600 },
            },
          },
          ...(liveTranscription ? {} : { include: ['item.input_audio_transcription.logprobs'] }),
        },
      }),
    });
    if (!upstream.ok) {
      console.error(JSON.stringify({ level: 'error', event: 'realtime_secret_failed', status: upstream.status, body: (await upstream.text()).slice(0, 500) }));
      throw new ApiError(502, 'realtime_unavailable', 'The live transcription service could not start. Please retry.');
    }
    const secret = clientSecretSchema.safeParse(await upstream.json());
    if (!secret.success) throw new ApiError(502, 'realtime_unavailable', 'The live transcription service returned an invalid session credential.');
    await getDb().update(sessions).set({ status: 'live' }).where(eq(sessions.id, id));
    return json({
      provider: 'openai',
      model: transcriptionModel,
      clientSecret: secret.data.value,
      expiresAt: secret.data.expires_at ?? null,
      endpoint: 'https://api.openai.com/v1/realtime/calls',
      clientTurnDetection,
      lease: { sessionId: id, channel: input.channel, issuedAt: Date.now(), expiresInSeconds: 600 },
      quota,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
