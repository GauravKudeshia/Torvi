import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sessionCaptures } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { handleApiError, json, parseJson } from '@/lib/http';
import { ownedSession } from '@/lib/session';

const captureSchema = z.object({
  kind: z.enum(['note', 'decision', 'action', 'bookmark', 'open_question']),
  text: z.string().trim().min(1).max(4_000),
  owner: z.string().trim().max(180).nullable().optional(),
  dueAt: z.number().int().nullable().optional(),
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    const { id } = await context.params;
    await ownedSession(id, actor.userId);
    const db = getDb();
    const captures = await db.select().from(sessionCaptures)
      .where(and(eq(sessionCaptures.sessionId, id), eq(sessionCaptures.userId, actor.userId)));
    return json({ captures });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    const { id } = await context.params;
    await ownedSession(id, actor.userId);
    const input = await parseJson(request, captureSchema);
    const db = getDb();
    const captureId = crypto.randomUUID();
    await db.insert(sessionCaptures).values({
      id: captureId,
      sessionId: id,
      userId: actor.userId,
      kind: input.kind,
      text: input.text,
      owner: input.owner ?? null,
      dueAt: input.dueAt ?? null,
      createdAt: Date.now(),
    });
    return json({ id: captureId, saved: true }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
