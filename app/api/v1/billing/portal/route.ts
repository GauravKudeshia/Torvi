import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { entitlements } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { ApiError, handleApiError, json } from '@/lib/http';
import { paddleRequest } from '@/lib/paddle';
import { enforceRateLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(`billing:portal:${actor.userId}`, 10, 10 * 60 * 1000);
    const rows = await getDb().select({
      source: entitlements.source,
      customerId: entitlements.sourceCustomerId,
    }).from(entitlements).where(eq(entitlements.userId, actor.userId)).limit(1);
    const entitlement = rows[0];
    if (entitlement?.source !== 'paddle' || !entitlement.customerId) {
      throw new ApiError(409, 'paddle_customer_not_found', 'No Paddle web subscription is linked to this account.');
    }
    const payload = await paddleRequest<{ data?: { urls?: { general?: { overview?: string } } } }>(
      `/customers/${encodeURIComponent(entitlement.customerId)}/portal-sessions`,
      { method: 'POST' },
    );
    const url = payload.data?.urls?.general?.overview;
    if (!url) throw new ApiError(502, 'portal_failed', 'Paddle did not return a customer portal link.');
    return json({ url });
  } catch (error) {
    return handleApiError(error);
  }
}
