import { and, eq } from 'drizzle-orm';
import { jobApplicationUpdateSchema } from '@interview-copilot/contracts';
import { getDb } from '@/db';
import { auditEvents, jobApplications } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { ApiError, handleApiError, json, parseJson } from '@/lib/http';

async function requireOwnedApplication(id: string, userId: string) {
  const rows = await getDb().select({ id: jobApplications.id }).from(jobApplications)
    .where(and(eq(jobApplications.id, id), eq(jobApplications.userId, userId))).limit(1);
  if (!rows[0]) throw new ApiError(404, 'job_application_not_found', 'Job application not found.');
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    const { id } = await context.params;
    await requireOwnedApplication(id, actor.userId);
    const input = await parseJson(request, jobApplicationUpdateSchema);
    const now = Date.now();
    const db = getDb();
    await db.batch([
      db.update(jobApplications).set({ ...input, updatedAt: now })
        .where(and(eq(jobApplications.id, id), eq(jobApplications.userId, actor.userId))),
      db.insert(auditEvents).values({
        id: crypto.randomUUID(), userId: actor.userId, action: 'job_application.updated',
        resourceType: 'job_application', resourceId: id,
        metadataJson: JSON.stringify({ fields: Object.keys(input) }), createdAt: now,
      }),
    ]);
    return json({ id, updated: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    const { id } = await context.params;
    await requireOwnedApplication(id, actor.userId);
    await getDb().delete(jobApplications)
      .where(and(eq(jobApplications.id, id), eq(jobApplications.userId, actor.userId)));
    return json({ id, deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
