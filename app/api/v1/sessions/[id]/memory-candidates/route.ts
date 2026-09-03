import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sessionCaptures } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { ApiError, handleApiError, json, parseJson } from '@/lib/http';
import { createProfessionalExperience } from '@/lib/professional-memory';
import { ownedSession } from '@/lib/session';

const promoteSchema = z.object({
  captureId: z.string().min(1).max(128),
  experienceTitle: z.string().trim().min(1).max(240),
  claimText: z.string().trim().min(1).max(1_200),
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    const { id } = await context.params;
    const session = await ownedSession(id, actor.userId);
    if (session.mode !== 'meeting') return json({ candidates: [] });
    const db = getDb();
    const candidates = await db.select().from(sessionCaptures).where(and(
      eq(sessionCaptures.sessionId, id), eq(sessionCaptures.userId, actor.userId), eq(sessionCaptures.kind, 'potential_memory'),
    ));
    return json({ candidates });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    const { id } = await context.params;
    const session = await ownedSession(id, actor.userId);
    if (session.mode !== 'meeting') throw new ApiError(409, 'meeting_mode_required', 'Only Meeting Mode creates potential career memories.');
    const input = await parseJson(request, promoteSchema);
    const db = getDb();
    const rows = await db.select().from(sessionCaptures).where(and(
      eq(sessionCaptures.id, input.captureId), eq(sessionCaptures.sessionId, id), eq(sessionCaptures.userId, actor.userId), eq(sessionCaptures.kind, 'potential_memory'),
    )).limit(1);
    if (!rows[0]) throw new ApiError(404, 'memory_candidate_not_found', 'Potential career memory not found.');
    const experienceId = await createProfessionalExperience({
      userId: actor.userId,
      title: input.experienceTitle,
      context: 'Proposed from a user-saved meeting. It must be verified before autobiographical use.',
      claims: [{ claimText: input.claimText, claimType: 'other', sourceType: 'meeting_session', sourceId: id, sourceExcerpt: rows[0].text }],
      claimsVerified: false,
    });
    await db.update(sessionCaptures).set({ kind: 'memory_added' }).where(and(eq(sessionCaptures.id, input.captureId), eq(sessionCaptures.userId, actor.userId)));
    return json({ experienceId, verificationStatus: 'proposed', memoryUrl: '/memory' }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
