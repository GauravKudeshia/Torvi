import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { documents, interviewRounds, jobTargets, reports, sessionCaptures, sessionDocuments, suggestions, transcriptSegments } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { handleApiError, json } from '@/lib/http';
import { ownedSession } from '@/lib/session';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    const { id } = await context.params;
    const session = await ownedSession(id, actor.userId);
    const db = getDb();
    const [targetRows, roundRows, documentRows, segmentRows, suggestionRows, reportRows, captureRows] = await Promise.all([
      session.jobTargetId ? db.select().from(jobTargets).where(eq(jobTargets.id, session.jobTargetId)).limit(1) : Promise.resolve([]),
      session.interviewRoundId ? db.select().from(interviewRounds).where(eq(interviewRounds.id, session.interviewRoundId)).limit(1) : Promise.resolve([]),
      db.select({ id: documents.id, fileName: documents.fileName, kind: documents.kind, parseStatus: documents.parseStatus }).from(sessionDocuments).innerJoin(documents, eq(sessionDocuments.documentId, documents.id)).where(eq(sessionDocuments.sessionId, id)),
      db.select().from(transcriptSegments).where(eq(transcriptSegments.sessionId, id)).orderBy(asc(transcriptSegments.startedAtMs)),
      db.select().from(suggestions).where(eq(suggestions.sessionId, id)).orderBy(asc(suggestions.createdAt)),
      db.select().from(reports).where(eq(reports.sessionId, id)).limit(1),
      db.select().from(sessionCaptures).where(eq(sessionCaptures.sessionId, id)).orderBy(asc(sessionCaptures.createdAt)),
    ]);
    const target = targetRows[0];
    const report = reportRows[0];
    return json({
      session: { ...session, title: roundRows[0]?.name || target?.role || session.mode.replace('-', ' ') },
      target: target ? { id: target.id, role: target.role, company: target.company, jobDescription: target.jobDescription } : null,
      documents: documentRows,
      transcript: segmentRows,
      interactions: suggestionRows.map((item) => ({ id: item.id, question: item.question, suggestion: JSON.parse(item.responseJson), createdAt: item.createdAt })),
      report: report ? { ...report, strengths: JSON.parse(report.strengthsJson), improvements: JSON.parse(report.improvementsJson), notes: JSON.parse(report.notesJson), actionItems: JSON.parse(report.actionItemsJson), strengthsJson: undefined, improvementsJson: undefined, notesJson: undefined, actionItemsJson: undefined } : null,
      captures: captureRows,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
