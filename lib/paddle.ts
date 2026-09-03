import { ApiError } from './http';
import { constantTimeEqual, hmacHex } from './crypto';

export type PaddleEnvironment = 'sandbox' | 'production';

export type PaddleWebhookEvent = {
  event_id?: string;
  event_type?: string;
  occurred_at?: string;
  data?: {
    id?: string;
    status?: string;
    customer_id?: string | null;
    subscription_id?: string | null;
    custom_data?: Record<string, unknown> | null;
    current_billing_period?: { ends_at?: string } | null;
    next_billed_at?: string | null;
  };
};

type PaddleApiError = {
  error?: {
    code?: string;
    detail?: string;
    errors?: Array<{ message?: string }>;
  };
};

export function paddleEnvironment(): PaddleEnvironment {
  const value = process.env.PADDLE_ENVIRONMENT ?? 'sandbox';
  if (value !== 'sandbox' && value !== 'production') {
    throw new ApiError(503, 'billing_not_configured', 'PADDLE_ENVIRONMENT must be sandbox or production.');
  }
  return value;
}

export function paddleApiBase(): string {
  return paddleEnvironment() === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com';
}

export async function verifyPaddleSignature(raw: string, signatureHeader: string | null): Promise<void> {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) throw new ApiError(503, 'paddle_not_configured', 'Paddle webhooks are not configured.');
  const pieces = (signatureHeader ?? '').split(';').map((part) => part.trim().split('='));
  const timestamp = pieces.find(([key]) => key === 'ts')?.[1];
  const signatures = pieces.filter(([key]) => key === 'h1').map(([, value]) => value);
  const toleranceSeconds = Number(process.env.PADDLE_WEBHOOK_TOLERANCE_SECONDS ?? '300');
  if (!Number.isFinite(toleranceSeconds) || toleranceSeconds <= 0) {
    throw new ApiError(503, 'paddle_not_configured', 'Paddle webhook tolerance is invalid.');
  }
  if (!timestamp || !Number.isFinite(Number(timestamp)) || Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) {
    throw new ApiError(401, 'invalid_webhook', 'Paddle webhook timestamp is invalid.');
  }
  const expected = await hmacHex(secret, `${timestamp}:${raw}`);
  if (!signatures.some((signature) => constantTimeEqual(signature, expected))) {
    throw new ApiError(401, 'invalid_webhook', 'Paddle webhook signature is invalid.');
  }
}

function paddleErrorMessage(payload: PaddleApiError, fallback: string): string {
  return payload.error?.detail ?? payload.error?.errors?.[0]?.message ?? fallback;
}

export async function paddleRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) throw new ApiError(503, 'billing_not_configured', 'Paddle web billing is not configured.');
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${apiKey}`);
  headers.set('content-type', 'application/json');
  headers.set('paddle-version', '1');
  const response = await fetch(`${paddleApiBase()}${path}`, { ...init, headers });
  const payload = await response.json() as T & PaddleApiError;
  if (!response.ok) {
    throw new ApiError(502, 'paddle_request_failed', paddleErrorMessage(payload, 'Paddle could not complete the billing request.'));
  }
  return payload;
}

export function normalizePaddleEntitlementEvent(event: PaddleWebhookEvent) {
  const data = event.data;
  if (!event.event_id || !event.event_type || !event.occurred_at || !data?.id) {
    throw new ApiError(400, 'invalid_webhook', 'Paddle webhook payload is invalid.');
  }
  const customData = data.custom_data ?? {};
  const userId = typeof customData.user_id === 'string'
    ? customData.user_id
    : (typeof customData.userId === 'string' ? customData.userId : null);
  if (!userId) return null;

  const isSubscription = event.event_type.startsWith('subscription.');
  const isCompletedRecurringTransaction = event.event_type === 'transaction.completed'
    && data.status === 'completed'
    && typeof data.subscription_id === 'string';
  if (!isSubscription && !isCompletedRecurringTransaction) return null;

  const active = isCompletedRecurringTransaction || data.status === 'active' || data.status === 'trialing';
  const periodEndIso = data.current_billing_period?.ends_at ?? data.next_billed_at ?? null;
  const parsedPeriodEnd = periodEndIso ? Date.parse(periodEndIso) : Number.NaN;
  const parsedOccurredAt = Date.parse(event.occurred_at);

  return {
    eventId: event.event_id,
    userId,
    active,
    customerId: data.customer_id ?? null,
    subscriptionId: isSubscription ? data.id : (data.subscription_id ?? null),
    periodEnd: Number.isFinite(parsedPeriodEnd) ? parsedPeriodEnd : null,
    eventOccurredAt: Number.isFinite(parsedOccurredAt) ? parsedOccurredAt : null,
  };
}
