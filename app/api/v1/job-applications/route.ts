import { desc, eq } from 'drizzle-orm';
import { jobApplicationCreateSchema } from '@interview-copilot/contracts';
import { getDb } from '@/db';
import { auditEvents, jobApplications } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { handleApiError, json, parseJson } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rate-limit';

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    const rows = await getDb().select().from(jobApplications)
      .where(eq(jobApplications.userId, actor.userId))
      .orderBy(desc(jobApplications.updatedAt));
    return json({ applications: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(`job-application-create:${actor.userId}`, 30, 60_000);
    const input = await parseJson(request, jobApplicationCreateSchema);
    const id = crypto.randomUUID();
    const now = Date.now();
    const db = getDb();
    await db.batch([
      db.insert(jobApplications).values({
        id,
        userId: actor.userId,
        role: input.role,
        company: input.company,
        jobUrl: input.jobUrl,
        jobDescription: input.jobDescription,
        status: input.status,
        notes: input.notes,
        nextAction: 'Review fit and tailor application materials',
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(auditEvents).values({
        id: crypto.randomUUID(), userId: actor.userId, action: 'job_application.created',
        resourceType: 'job_application', resourceId: id,
        metadataJson: JSON.stringify({ status: input.status }), createdAt: now,
      }),
    ]);
    return json({ id }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
