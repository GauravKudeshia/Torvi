import { env } from 'cloudflare:workers';
import { requireActor } from '@/lib/auth';
import { handleApiError, json } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rate-limit';

type OpenAiError = { error?: { type?: string; code?: string; param?: string; message?: string } };

function aiFailureDetail(status: number, payload: OpenAiError): string {
  const code = payload.error?.code;
  if (status === 401 || code === 'invalid_api_key') return 'The hosted AI credential is invalid or no longer active. Live coaching is affected.';
  if (code === 'insufficient_quota') return 'The OpenAI API project has exhausted its available quota or reached its spend limit. Live coaching is affected.';
  if (status === 429) return 'The AI service is temporarily rate limited. Retry shortly before starting the interview.';
  if (status === 403 || code === 'model_not_found') return 'The configured AI model is not available to this OpenAI project. Live coaching is affected.';
  return 'The AI service did not accept the test request. Live coaching is affected.';
}

export async function GET(request: Request) {
  try {
    await requireActor(request);
    const checks = [
      { id: 'backend_auth', label: 'Backend authentication', status: 'ready', detail: 'Authenticated request completed.' },
      { id: 'database', label: 'Session storage', status: 'ready', detail: 'Account data store responded.' },
      process.env.OPENAI_API_KEY
        ? { id: 'ai', label: 'AI service configuration', status: 'ready', detail: 'Server-side AI credential is configured. A live request is tested when the session starts.' }
        : { id: 'ai', label: 'AI service configuration', status: 'failed', detail: 'The server-side AI credential is missing.' },
      env.FILES
        ? { id: 'documents', label: 'Document storage', status: 'ready', detail: 'Private document storage is available.' }
        : { id: 'documents', label: 'Document storage', status: 'warning', detail: 'Document storage is not available in this runtime.' },
    ];
    return json({ checks, checkedAt: Date.now() });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(`preflight-ai:${actor.userId}`, 8, 60_000);
    const key = process.env.OPENAI_API_KEY;
    if (!key) return json({ id: 'ai', label: 'AI response test', status: 'failed', detail: 'The hosted AI credential is not configured.', latencyMs: null });
    const startedAt = Date.now();
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_FAST_MODEL ?? 'gpt-5.6-luna',
        store: false,
        input: 'Return exactly READY.',
        // The Responses API currently enforces a minimum of 16 output tokens.
        // Keep this test small while still sending a valid production request.
        max_output_tokens: 16,
      }),
    });
    const latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as OpenAiError;
      console.error(JSON.stringify({
        level: 'error',
        event: 'preflight_ai_failed',
        status: response.status,
        requestId: response.headers.get('x-request-id'),
        type: payload.error?.type,
        code: payload.error?.code,
        param: payload.error?.param,
      }));
      return json({ id: 'ai', label: 'AI response test', status: 'failed', detail: aiFailureDetail(response.status, payload), latencyMs });
    }
    return json({ id: 'ai', label: 'AI response test', status: 'ready', detail: 'A real hosted response completed successfully.', latencyMs });
  } catch (error) {
    return handleApiError(error);
  }
}
