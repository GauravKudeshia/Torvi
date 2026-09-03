import { and, eq, sql } from 'drizzle-orm';
import type { getDb } from '@/db';
import { entitlements, usageLedger } from '@/db/schema';
import { FREE_LIVE_MINUTES, FREE_MOCK_SESSIONS, PRO_LIVE_MINUTES } from '@interview-copilot/contracts';

type Db = ReturnType<typeof getDb>;

export function currentPeriodKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function quotaFor(db: Db, userId: string) {
  const entitlement = await db.select().from(entitlements).where(eq(entitlements.userId, userId)).limit(1);
  const plan = entitlement[0]?.plan === 'pro' && entitlement[0]?.status === 'active' ? 'pro' : 'free';
  const periodKey = currentPeriodKey();
  const usage = await db.select({
    liveSeconds: sql<number>`coalesce(sum(${usageLedger.liveSeconds}), 0)`,
    mockSessions: sql<number>`coalesce(sum(${usageLedger.mockSessions}), 0)`,
  }).from(usageLedger).where(and(eq(usageLedger.userId, userId), eq(usageLedger.periodKey, periodKey)));
  const liveLimitSeconds = (plan === 'pro' ? PRO_LIVE_MINUTES : FREE_LIVE_MINUTES) * 60;
  const usedLiveSeconds = Number(usage[0]?.liveSeconds ?? 0);
  const usedMockSessions = Number(usage[0]?.mockSessions ?? 0);
  return {
    plan,
    periodKey,
    liveLimitMinutes: liveLimitSeconds / 60,
    remainingLiveSeconds: Math.max(0, liveLimitSeconds - usedLiveSeconds),
    mockLimit: plan === 'pro' ? null : FREE_MOCK_SESSIONS,
    remainingMockSessions: plan === 'pro' ? null : Math.max(0, FREE_MOCK_SESSIONS - usedMockSessions),
  };
}
