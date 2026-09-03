import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sessions } from '@/db/schema';
import { ApiError } from './http';

export async function ownedSession(sessionId: string, userId: string) {
  const db = getDb();
  const rows = await db.select().from(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId))).limit(1);
  if (!rows[0]) throw new ApiError(404, 'session_not_found', 'Session not found.');
  return rows[0];
}
