import { z } from 'zod';
import { modeRequiresVerifiedResume, transcriptSegmentSchema, type InterviewMode } from '@interview-copilot/contracts';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { auditEvents, documents, interviewRounds, reports, roundConcerns, sessionCaptures, sessionDocuments, sessions, transcriptSegments } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { handleApiError, json, parseJson } from '@/lib/http';
import { ownedSession } from '@/lib/session';
import { createSessionReport, type SessionReportResult } from '@/lib/openai';
import { detectRoundConcerns } from '@/lib/interview-memory';

const saveSchema = z.object({
  segments: z.array(transcriptSegmentSchema).max(2_000).default([]),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    const { id } = await context.params;
    const session = await ownedSession(id, actor.userId);
    if (session.status === 'discarded') return json({ id, status: 'discarded' });
    const input = await parseJson(request, saveSchema);
    const db = getDb();
    const now = Date.now();
    const reportId = session.reportId ?? crypto.randomUUID();
    const candidateTurns = input.segments.filter((segment) => segment.speaker === 'candidate').length;
    const interviewerTurns = input.segments.filter((segment) => segment.speaker === 'interviewer').length;
    const statements = input.segments.reduce((count, segment) => count + segment.text.split(/[.!?]+/).filter(Boolean).length, 0);
    const score = Math.min(100, Math.round(55 + Math.min(20, candidateTurns * 3) + Math.min(15, interviewerTurns * 2) + Math.min(10, statements)));
    const resumeDocuments = await db.select({ facts: documents.verifiedFactsJson, kind: documents.kind })
      .from(sessionDocuments)
      .innerJoin(documents, eq(sessionDocuments.documentId, documents.id))
      .where(eq(sessionDocuments.sessionId, id));
    const verifiedFacts = resumeDocuments.filter((document) => document.kind === 'resume')
      .flatMap((document) => JSON.parse(document.facts) as string[]).slice(0, 80);
    let report: SessionReportResult = {
      score,
      summary: candidateTurns
        ? `You contributed ${candidateTurns} turns. Review the transcript to sharpen the main points, confirm decisions, and make the next step explicit.`
        : 'The session was saved before your side of the conversation was captured.',
      strengths: candidateTurns >= 3 ? ['Stayed engaged in the conversation', 'Responded across multiple turns'] : ['Started a focused live session'],
      improvements: ['Lead with a clear point', 'Separate facts from assumptions', 'Close with a specific next step'],
      notes: input.segments.slice(-8).map((segment) => `${segment.speaker === 'candidate' ? 'You' : 'Other side'}: ${segment.text}`),
      actionItems: ['Review the saved transcript', 'Confirm the most important decision', 'Follow through on the next step'],
      followUpEmail: 'Subject: Follow-up\n\nThank you for the conversation today. I appreciated the discussion. Here is my understanding of the next step: [confirm next step]. Please let me know if I missed anything.\n\nBest,\n[Your name]',
    };
    if (input.segments.length) {
      try {
        report = await createSessionReport(session.locale, session.mode as InterviewMode, input.segments, verifiedFacts, actor.subject);
      } catch (reportError) {
        console.warn(JSON.stringify({ level: 'warn', event: 'session_report_fallback', sessionId: id, reason: reportError instanceof Error ? reportError.message : 'unknown' }));
      }
    }

    const writes = input.segments.map((segment) => db.insert(transcriptSegments).values({
      id: segment.id,
      sessionId: id,
      speaker: segment.speaker,
      text: segment.text,
      startedAtMs: segment.startedAtMs,
      endedAtMs: segment.endedAtMs,
      itemId: segment.itemId,
      createdAt: now,
    }).onConflictDoNothing());
    await Promise.all(writes);
    await db.batch([
      db.insert(reports).values({
        id: reportId,
        userId: actor.userId,
        sessionId: id,
        score: report.score,
        summary: report.summary,
        strengthsJson: JSON.stringify(report.strengths),
        improvementsJson: JSON.stringify(report.improvements),
        notesJson: JSON.stringify(report.notes),
        actionItemsJson: JSON.stringify(report.actionItems),
        followUpEmail: report.followUpEmail,
        createdAt: now,
      }).onConflictDoUpdate({
        target: reports.sessionId,
        set: {
          score: report.score,
          summary: report.summary,
          strengthsJson: JSON.stringify(report.strengths),
          improvementsJson: JSON.stringify(report.improvements),
          notesJson: JSON.stringify(report.notes),
          actionItemsJson: JSON.stringify(report.actionItems),
          followUpEmail: report.followUpEmail,
          createdAt: now,
        },
      }),
      db.update(sessions).set({ status: 'saved', savedAt: now, reportId }).where(eq(sessions.id, id)),
      db.insert(auditEvents).values({
        id: crypto.randomUUID(),
        userId: actor.userId,
        action: 'session.saved',
        resourceType: 'session',
        resourceId: id,
        metadataJson: JSON.stringify({ segmentCount: input.segments.length }),
        createdAt: now,
      }),
    ]);
    const detectedConcerns = modeRequiresVerifiedResume(session.mode) ? detectRoundConcerns(input.segments) : [];
    if (session.interviewRoundId) {
      await db.update(interviewRounds).set({ status: 'completed', completedAt: now, summary: report.summary, updatedAt: now })
        .where(eq(interviewRounds.id, session.interviewRoundId));
      await Promise.all(detectedConcerns.map((concern) => db.insert(roundConcerns).values({
        id: crypto.randomUUID(),
        roundId: session.interviewRoundId!,
        userId: actor.userId,
        category: concern.category,
        summary: concern.summary,
        evidence: concern.evidence,
        status: 'proposed',
        createdAt: now,
        updatedAt: now,
      })));
    }
    const potentialMemory = !modeRequiresVerifiedResume(session.mode)
      ? input.segments.filter((segment) => segment.speaker === 'candidate' && /\bI (?:led|owned|designed|built|implemented|decided|proposed|resolved|launched|improved|reduced|increased)\b/i.test(segment.text))
        .map((segment) => segment.text).filter((text, index, all) => all.indexOf(text) === index).slice(0, 8)
      : [];
    await Promise.all(potentialMemory.map((text) => db.insert(sessionCaptures).values({
      id: crypto.randomUUID(), sessionId: id, userId: actor.userId, kind: 'potential_memory', text, createdAt: now,
    })));
    return json({ id, status: 'saved', reportId, proposedConcerns: detectedConcerns.length, potentialCareerMemories: potentialMemory.length });
  } catch (error) {
    return handleApiError(error);
  }
}
