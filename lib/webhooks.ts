import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { entitlements, users, webhookEvents } from '@/db/schema';
import { constantTimeEqual, sha256Hex } from './crypto';
import { ApiError } from './http';

export function verifyRevenueCatAuthorization(header: string | null): void {
  const secret = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!secret) throw new ApiError(503, 'revenuecat_not_configured', 'RevenueCat webhooks are not configured.');
  if (!header || !constantTimeEqual(header, secret)) throw new ApiError(401, 'invalid_webhook', 'RevenueCat webhook authorization is invalid.');
}

export async function applyEntitlementEvent(input: {
  provider: 'paddle' | 'revenuecat';
  eventId: string;
  raw: string;
  userId: string;
  active: boolean;
  customerId?: string | null;
  subscriptionId?: string | null;
  periodEnd?: number | null;
  eventOccurredAt?: number | null;
}) {
  const db = getDb();
  const exists = await db.select({ id: webhookEvents.id }).from(webhookEvents)
    .where(and(eq(webhookEvents.provider, input.provider), eq(webhookEvents.eventId, input.eventId))).limit(1);
  if (exists[0]) return { duplicate: true };
  const owner = await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1);
  if (!owner[0]) throw new ApiError(202, 'unmatched_customer', 'Webhook accepted but no matching user was found.');
  const now = Date.now();
  const current = await db.select({
    source: entitlements.source,
    sourceEventOccurredAt: entitlements.sourceEventOccurredAt,
  }).from(entitlements).where(eq(entitlements.userId, input.userId)).limit(1);
  const stale = current[0]?.source === input.provider
    && typeof current[0].sourceEventOccurredAt === 'number'
    && typeof input.eventOccurredAt === 'number'
    && input.eventOccurredAt < current[0].sourceEventOccurredAt;
  if (stale) {
    await db.insert(webhookEvents).values({
      id: crypto.randomUUID(),
      provider: input.provider,
      eventId: input.eventId,
      payloadHash: await sha256Hex(input.raw),
      status: 'ignored_stale',
      processedAt: now,
    });
    return { duplicate: false, stale: true };
  }
  await db.batch([
    db.insert(entitlements).values({
      userId: input.userId,
      plan: input.active ? 'pro' : 'free',
      status: input.active ? 'active' : 'inactive',
      source: input.provider,
      sourceCustomerId: input.customerId,
      sourceSubscriptionId: input.subscriptionId,
      sourceEventOccurredAt: input.eventOccurredAt,
      currentPeriodEnd: input.periodEnd,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: entitlements.userId,
      set: {
        plan: input.active ? 'pro' : 'free',
        status: input.active ? 'active' : 'inactive',
        source: input.provider,
        sourceCustomerId: input.customerId,
        sourceSubscriptionId: input.subscriptionId,
        sourceEventOccurredAt: input.eventOccurredAt,
        currentPeriodEnd: input.periodEnd,
        updatedAt: now,
      },
    }),
    db.insert(webhookEvents).values({
      id: crypto.randomUUID(),
      provider: input.provider,
      eventId: input.eventId,
      payloadHash: await sha256Hex(input.raw),
      status: 'processed',
      processedAt: now,
    }),
  ]);
  return { duplicate: false };
}
