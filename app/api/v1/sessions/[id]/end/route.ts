import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sessions, usageLedger } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { handleApiError, json, parseJson } from '@/lib/http';
import { ownedSession } from '@/lib/session';
import { currentPeriodKey, quotaFor } from '@/lib/usage';

const endSchema = z.object({ liveSeconds: z.number().int().nonnegative().max(8 * 60 * 60).default(0) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    const { id } = await context.params;
    const session = await ownedSession(id, actor.userId);
    const input = await parseJson(request, endSchema);
    if (session.endedAt) return json({ id, status: session.status, quota: await quotaFor(getDb(), actor.userId) });
    const db = getDb();
    const now = Date.now();
    await db.batch([
      db.update(sessions).set({ status: 'ended', endedAt: now, liveSeconds: input.liveSeconds }).where(eq(sessions.id, id)),
      db.insert(usageLedger).values({
        id: crypto.randomUUID(),
        userId: actor.userId,
        periodKey: currentPeriodKey(),
        liveSeconds: session.mode === 'mock' ? 0 : input.liveSeconds,
        mockSessions: session.mode === 'mock' ? 1 : 0,
        reason: 'session.ended',
        externalRef: `session:${id}:end`,
        createdAt: now,
      }).onConflictDoNothing(),
    ]);
    return json({ id, status: 'ended', retentionChoice: session.retentionChoice, quota: await quotaFor(db, actor.userId) });
  } catch (error) {
    return handleApiError(error);
  }
}
