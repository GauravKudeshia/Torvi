import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { jobTargets } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { ApiError, handleApiError, json, parseJson } from '@/lib/http';

const updateTargetSchema = z.object({
  role: z.string().trim().min(1).max(180).optional(),
  company: z.string().trim().min(1).max(180).optional(),
  jobDescription: z.string().trim().max(50_000).nullable().optional(),
  competencies: z.array(z.string().trim().min(1).max(180)).max(40).optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one target field is required.');

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    const { id } = await context.params;
    const input = await parseJson(request, updateTargetSchema);
    const db = getDb();
    const rows = await db.select({ id: jobTargets.id }).from(jobTargets)
      .where(and(eq(jobTargets.id, id), eq(jobTargets.userId, actor.userId))).limit(1);
    if (!rows[0]) throw new ApiError(404, 'job_target_not_found', 'Opportunity not found.');
    await db.update(jobTargets).set({
      ...(input.role === undefined ? {} : { role: input.role }),
      ...(input.company === undefined ? {} : { company: input.company }),
      ...(input.jobDescription === undefined ? {} : { jobDescription: input.jobDescription }),
      ...(input.competencies === undefined ? {} : { competenciesJson: JSON.stringify(input.competencies) }),
      updatedAt: Date.now(),
    }).where(and(eq(jobTargets.id, id), eq(jobTargets.userId, actor.userId)));
    return json({ id, updated: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    const { id } = await context.params;
    await getDb().delete(jobTargets).where(and(eq(jobTargets.id, id), eq(jobTargets.userId, actor.userId)));
    return json({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
