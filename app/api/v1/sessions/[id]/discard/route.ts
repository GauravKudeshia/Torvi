import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { auditEvents, reports, sessions, suggestions, transcriptSegments } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { handleApiError, json } from '@/lib/http';
import { ownedSession } from '@/lib/session';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    const { id } = await context.params;
    const session = await ownedSession(id, actor.userId);
    if (session.status === 'discarded') return json({ id, status: 'discarded' });
    const db = getDb();
    const now = Date.now();
    await db.batch([
      db.delete(transcriptSegments).where(eq(transcriptSegments.sessionId, id)),
      db.delete(suggestions).where(eq(suggestions.sessionId, id)),
      db.delete(reports).where(eq(reports.sessionId, id)),
      db.update(sessions).set({ status: 'discarded', discardedAt: now, reportId: null }).where(eq(sessions.id, id)),
      db.insert(auditEvents).values({
        id: crypto.randomUUID(),
        userId: actor.userId,
        action: 'session.discarded',
        resourceType: 'session',
        resourceId: id,
        metadataJson: '{}',
        createdAt: now,
      }),
    ]);
    return json({ id, status: 'discarded', transcriptDeleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
