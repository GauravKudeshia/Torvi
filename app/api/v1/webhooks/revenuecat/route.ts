import { applyEntitlementEvent, verifyRevenueCatAuthorization } from '@/lib/webhooks';
import { ApiError, handleApiError, json } from '@/lib/http';

type RevenueCatPayload = {
  event?: {
    id?: string;
    type?: string;
    app_user_id?: string;
    product_id?: string;
    expiration_at_ms?: number;
    event_timestamp_ms?: number;
    original_app_user_id?: string;
  };
};

export async function POST(request: Request) {
  try {
    verifyRevenueCatAuthorization(request.headers.get('authorization'));
    const raw = await request.text();
    const { event } = JSON.parse(raw) as RevenueCatPayload;
    if (!event?.id || !event.type || !event.app_user_id) throw new ApiError(400, 'invalid_webhook', 'RevenueCat webhook payload is invalid.');
    const inactiveTypes = ['EXPIRATION', 'BILLING_ISSUE', 'PRODUCT_CHANGE'];
    const result = await applyEntitlementEvent({
      provider: 'revenuecat',
      eventId: event.id,
      raw,
      userId: event.app_user_id,
      active: !inactiveTypes.includes(event.type),
      customerId: event.original_app_user_id ?? event.app_user_id,
      subscriptionId: event.product_id,
      periodEnd: event.expiration_at_ms ?? null,
      eventOccurredAt: event.event_timestamp_ms ?? null,
    });
    return json({ received: true, ...result });
  } catch (error) {
    return handleApiError(error);
  }
}
