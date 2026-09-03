import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { auditEvents, documents, interviewRounds, jobTargets, sessionDocuments, sessions } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { handleApiError, json, parseJson } from '@/lib/http';
import { ownedSession } from '@/lib/session';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    const { id } = await context.params;
    const session = await ownedSession(id, actor.userId);
    const db = getDb();
    const target = session.jobTargetId
      ? await db.select().from(jobTargets).where(eq(jobTargets.id, session.jobTargetId)).limit(1)
      : [];
    const contextDocuments = await db.select({
      id: documents.id,
      fileName: documents.fileName,
      kind: documents.kind,
      parseStatus: documents.parseStatus,
    }).from(sessionDocuments)
      .innerJoin(documents, eq(sessionDocuments.documentId, documents.id))
      .where(eq(sessionDocuments.sessionId, id));
    return json({
      session: { id: session.id, mode: session.mode, locale: session.locale, status: session.status },
      target: target[0] ? {
        id: target[0].id,
        role: target[0].role,
        company: target[0].company,
        jobDescription: target[0].jobDescription,
      } : null,
      documents: contextDocuments,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const renameSchema = z.object({ title: z.string().trim().min(2).max(160) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    const { id } = await context.params;
    const session = await ownedSession(id, actor.userId);
    const input = await parseJson(request, renameSchema);
    if (!session.interviewRoundId) return json({ id, title: input.title });
    await getDb().update(interviewRounds).set({ name: input.title, updatedAt: Date.now() }).where(eq(interviewRounds.id, session.interviewRoundId));
    return json({ id, title: input.title });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    const { id } = await context.params;
    const session = await ownedSession(id, actor.userId);
    const now = Date.now();
    await getDb().insert(auditEvents).values({ id: crypto.randomUUID(), userId: actor.userId, action: 'session.deleted', resourceType: 'session', resourceId: id, metadataJson: '{}', createdAt: now });
    await getDb().delete(sessions).where(eq(sessions.id, id));
    if (session.interviewRoundId) await getDb().delete(interviewRounds).where(eq(interviewRounds.id, session.interviewRoundId));
    return json({ id, deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
