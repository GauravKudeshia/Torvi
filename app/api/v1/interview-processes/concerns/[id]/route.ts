import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { roundConcerns } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { ApiError, handleApiError, json, parseJson } from '@/lib/http';

const concernActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('confirm') }),
  z.object({ action: z.literal('dismiss') }),
  z.object({ action: z.literal('edit'), summary: z.string().trim().min(1).max(1_000) }),
]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    const { id } = await context.params;
    const input = await parseJson(request, concernActionSchema);
    const db = getDb();
    const rows = await db.select().from(roundConcerns)
      .where(and(eq(roundConcerns.id, id), eq(roundConcerns.userId, actor.userId))).limit(1);
    if (!rows[0]) throw new ApiError(404, 'concern_not_found', 'Concern not found.');
    await db.update(roundConcerns).set({
      status: input.action === 'confirm' ? 'confirmed' : input.action === 'dismiss' ? 'dismissed' : rows[0].status,
      summary: input.action === 'edit' ? input.summary : rows[0].summary,
      updatedAt: Date.now(),
    }).where(and(eq(roundConcerns.id, id), eq(roundConcerns.userId, actor.userId)));
    return json({ updated: true });
  } catch (error) {
    return handleApiError(error);
  }
}
