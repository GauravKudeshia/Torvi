import { sha256Hex } from './crypto';

export type MetricName =
  | 'session.started'
  | 'session.completed'
  | 'transcription.failed'
  | 'suggestion.failed'
  | 'quota.exhausted'
  | 'checkout.started'
  | 'document.parsed'
  | 'question.detected'
  | 'question.corrected'
  | 'question.false_positive'
  | 'transcription.delta'
  | 'suggestion.first_useful'
  | 'retrieval.completed'
  | 'audio.failed'
  | 'audio.disconnected'
  | 'connection.reconnected'
  | 'generation.failed'
  | 'grounding.completed'
  | 'evidence_gap'
  | 'answer.expanded'
  | 'followup.opened'
  | 'preflight.completed'
  | 'memory.claim_verified'
  | 'memory.claim_prevented';

const forbiddenKeys = /audio|screenshot|transcript|answer|question|resume|email|name/i;

export function structuredLog(event: string, attributes: Record<string, string | number | boolean | null> = {}) {
  const safe = Object.fromEntries(Object.entries(attributes).filter(([key]) => !forbiddenKeys.test(key)));
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: 'interview-copilot', event, ...safe }));
}

export async function anonymousAnalyticsId(userId: string): Promise<string> {
  return (await sha256Hex(`analytics:${userId}`)).slice(0, 32);
}

export async function captureException(error: unknown, context: Record<string, string | number | boolean> = {}) {
  const dsn = process.env.SENTRY_DSN;
  structuredLog('exception', { message: error instanceof Error ? error.message : 'unknown', ...context });
  if (!dsn) return;
  const url = new URL(dsn);
  const projectId = url.pathname.replace('/', '');
  const endpoint = `${url.protocol}//${url.host}/api/${projectId}/store/`;
  const event = {
    event_id: crypto.randomUUID().replaceAll('-', ''),
    timestamp: new Date().toISOString(),
    platform: 'javascript',
    environment: process.env.SENTRY_ENVIRONMENT ?? 'production',
    level: 'error',
    exception: { values: [{ type: error instanceof Error ? error.name : 'Error', value: error instanceof Error ? error.message : 'Unknown error' }] },
    tags: Object.fromEntries(Object.entries(context).filter(([key]) => !forbiddenKeys.test(key))),
  };
  await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-sentry-auth': `Sentry sentry_version=7,sentry_key=${url.username}` },
    body: JSON.stringify(event),
  }).catch(() => undefined);
}
