import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { auditEvents, deletionRequests, users } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { ApiError, handleApiError, json, parseJson } from '@/lib/http';

const deletionSchema = z.object({ confirmation: z.literal('DELETE MY ACCOUNT') });

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    await parseJson(request, deletionSchema);
    const db = getDb();
    const now = Date.now();
    const executeAfter = now + 7 * 24 * 60 * 60 * 1000;
    const id = crypto.randomUUID();
    await db.batch([
      db.insert(deletionRequests).values({ id, userId: actor.userId, status: 'scheduled', requestedAt: now, executeAfter }),
      db.update(users).set({ deletionScheduledAt: executeAfter, updatedAt: now }).where(eq(users.id, actor.userId)),
      db.insert(auditEvents).values({
        id: crypto.randomUUID(), userId: actor.userId, action: 'account.deletion_scheduled',
        resourceType: 'user', resourceId: actor.userId, metadataJson: JSON.stringify({ executeAfter }), createdAt: now,
      }),
    ]);
    return json({ id, status: 'scheduled', executeAfter });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireActor(request);
    const db = getDb();
    const scheduled = await db.select().from(deletionRequests).where(eq(deletionRequests.userId, actor.userId));
    if (!scheduled.some((item) => item.status === 'scheduled')) throw new ApiError(404, 'deletion_not_scheduled', 'No account deletion is scheduled.');
    await db.batch([
      db.update(deletionRequests).set({ status: 'cancelled' }).where(eq(deletionRequests.userId, actor.userId)),
      db.update(users).set({ deletionScheduledAt: null, updatedAt: Date.now() }).where(eq(users.id, actor.userId)),
    ]);
    return json({ status: 'cancelled' });
  } catch (error) {
    return handleApiError(error);
  }
}
