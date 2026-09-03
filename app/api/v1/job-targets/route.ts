import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { jobTargets } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { handleApiError, json, parseJson } from '@/lib/http';

const targetSchema = z.object({
  role: z.string().trim().min(1).max(180),
  company: z.string().trim().min(1).max(180),
  jobDescription: z.string().trim().max(50_000).nullable().optional(),
  competencies: z.array(z.string().trim().min(1).max(180)).max(40).default([]),
});

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    const rows = await getDb().select().from(jobTargets).where(eq(jobTargets.userId, actor.userId)).orderBy(desc(jobTargets.updatedAt));
    return json({ jobTargets: rows.map((row) => ({ ...row, competencies: JSON.parse(row.competenciesJson), competenciesJson: undefined })) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    const input = await parseJson(request, targetSchema);
    const now = Date.now();
    const id = crypto.randomUUID();
    await getDb().insert(jobTargets).values({
      id,
      userId: actor.userId,
      role: input.role,
      company: input.company,
      jobDescription: input.jobDescription,
      competenciesJson: JSON.stringify(input.competencies),
      createdAt: now,
      updatedAt: now,
    });
    return json({ id }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
