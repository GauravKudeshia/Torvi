import { applyEntitlementEvent } from '@/lib/webhooks';
import { ApiError, handleApiError, json } from '@/lib/http';
import { normalizePaddleEntitlementEvent, verifyPaddleSignature, type PaddleWebhookEvent } from '@/lib/paddle';

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    await verifyPaddleSignature(raw, request.headers.get('paddle-signature'));
    let event: PaddleWebhookEvent;
    try {
      event = JSON.parse(raw) as PaddleWebhookEvent;
    } catch {
      throw new ApiError(400, 'invalid_webhook', 'Paddle webhook body is not valid JSON.');
    }
    const normalized = normalizePaddleEntitlementEvent(event);
    if (!normalized) return json({ received: true, ignored: 'not_an_entitlement_event' });
    const result = await applyEntitlementEvent({
      provider: 'paddle',
      raw,
      ...normalized,
    });
    return json({ received: true, ...result });
  } catch (error) {
    return handleApiError(error);
  }
}
