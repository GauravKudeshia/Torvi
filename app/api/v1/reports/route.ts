import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { reports, sessions } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { handleApiError, json } from '@/lib/http';

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    const rows = await getDb().select({ report: reports, mode: sessions.mode }).from(reports)
      .innerJoin(sessions, eq(reports.sessionId, sessions.id))
      .where(eq(reports.userId, actor.userId)).orderBy(desc(reports.createdAt)).limit(50);
    return json({ reports: rows.map((report) => ({
      ...report.report,
      mode: report.mode,
      strengths: JSON.parse(report.report.strengthsJson),
      improvements: JSON.parse(report.report.improvementsJson),
      notes: JSON.parse(report.report.notesJson),
      actionItems: JSON.parse(report.report.actionItemsJson),
      strengthsJson: undefined,
      improvementsJson: undefined,
      notesJson: undefined,
      actionItemsJson: undefined,
    })) });
  } catch (error) {
    return handleApiError(error);
  }
}
