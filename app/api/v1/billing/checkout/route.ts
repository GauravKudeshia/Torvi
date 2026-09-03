import { z } from 'zod';
import { requireActor } from '@/lib/auth';
import { ApiError, handleApiError, json, parseJson } from '@/lib/http';
import { paddleEnvironment, paddleRequest } from '@/lib/paddle';
import { enforceRateLimit } from '@/lib/rate-limit';

const checkoutSchema = z.object({ interval: z.enum(['month', 'year']) });

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(`billing:checkout:${actor.userId}`, 10, 10 * 60 * 1000);
    const input = await parseJson(request, checkoutSchema);
    const clientToken = process.env.PADDLE_CLIENT_TOKEN;
    const priceId = input.interval === 'year' ? process.env.PADDLE_PRICE_PRO_YEARLY : process.env.PADDLE_PRICE_PRO_MONTHLY;
    if (!clientToken || !priceId) throw new ApiError(503, 'billing_not_configured', 'Paddle Checkout is not configured.');
    const origin = process.env.PUBLIC_APP_ORIGIN ?? new URL(request.url).origin;
    const payload = await paddleRequest<{ data?: { id?: string } }>('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ price_id: priceId, quantity: 1 }],
        collection_mode: 'automatic',
        custom_data: {
          user_id: actor.userId,
          plan: 'pro',
          billing_interval: input.interval,
        },
      }),
    });
    if (!payload.data?.id) throw new ApiError(502, 'checkout_failed', 'Paddle did not return a transaction.');
    return json({
      transactionId: payload.data.id,
      clientToken,
      environment: paddleEnvironment(),
      customerEmail: actor.email,
      successUrl: `${origin}/dashboard?checkout=success`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
