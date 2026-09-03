import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { rateLimitWindows } from '@/db/schema';
import { ApiError } from './http';

export async function enforceRateLimit(key: string, limit: number, windowMs: number): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const found = await db.select().from(rateLimitWindows).where(eq(rateLimitWindows.key, key)).limit(1);
  if (!found[0] || found[0].expiresAt <= now) {
    await db.insert(rateLimitWindows).values({ key, windowStartedAt: now, count: 1, expiresAt: now + windowMs })
      .onConflictDoUpdate({ target: rateLimitWindows.key, set: { windowStartedAt: now, count: 1, expiresAt: now + windowMs } });
    return;
  }
  if (found[0].count >= limit) {
    throw new ApiError(429, 'rate_limited', 'Too many requests. Try again shortly.', { retryAfterMs: found[0].expiresAt - now });
  }
  await db.update(rateLimitWindows).set({ count: found[0].count + 1 }).where(eq(rateLimitWindows.key, key));
}
