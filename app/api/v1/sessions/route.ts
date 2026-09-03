import { and, desc, eq, inArray } from 'drizzle-orm';
import { modeRequiresVerifiedResume, sessionStartSchema } from '@interview-copilot/contracts';
import { getDb } from '@/db';
import { auditEvents, consentReceipts, devices, documents, interviewProcesses, interviewRounds, jobTargets, sessionDocuments, sessions } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { ApiError, handleApiError, json, parseJson } from '@/lib/http';
import { quotaFor } from '@/lib/usage';
import { enforceRateLimit } from '@/lib/rate-limit';
import { compileSessionBrain } from '@/lib/session-brain';

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    const db = getDb();
    const rows = await db.select({ session: sessions, roundName: interviewRounds.name, role: jobTargets.role, company: jobTargets.company })
      .from(sessions)
      .leftJoin(interviewRounds, eq(sessions.interviewRoundId, interviewRounds.id))
      .leftJoin(jobTargets, eq(sessions.jobTargetId, jobTargets.id))
      .where(eq(sessions.userId, actor.userId)).orderBy(desc(sessions.startedAt)).limit(50);
    return json({ sessions: rows.map(({ session, roundName, role, company }) => ({ ...session, title: roundName || role || session.mode.replace('-', ' '), role, company })) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(`session-create:${actor.userId}`, 20, 60_000);
    const input = await parseJson(request, sessionStartSchema);
    const db = getDb();
    const quota = await quotaFor(db, actor.userId);
    if (input.mode === 'mock' && quota.remainingMockSessions === 0) {
      throw new ApiError(402, 'mock_quota_exhausted', 'Your monthly mock-session quota is exhausted.');
    }
    if (input.mode !== 'mock' && quota.remainingLiveSeconds <= 0) {
      throw new ApiError(402, 'live_quota_exhausted', 'Your monthly live coaching quota is exhausted.');
    }
    const target = await db.select().from(jobTargets).where(eq(jobTargets.id, input.jobTargetId)).limit(1);
    if (!target[0] || target[0].userId !== actor.userId) throw new ApiError(404, 'job_target_not_found', 'Job target not found.');
    if (!target[0].company?.trim()) throw new ApiError(422, 'company_required', 'Add an organization, team, or company before starting.');

    const documentIds = [...new Set(input.documentIds)];
    if (documentIds.length !== input.documentIds.length) throw new ApiError(422, 'duplicate_documents', 'Each context document can only be attached once.');
    const attachedDocuments = await db.select({ id: documents.id, userId: documents.userId, kind: documents.kind, parseStatus: documents.parseStatus })
      .from(documents).where(inArray(documents.id, documentIds));
    if (attachedDocuments.length !== documentIds.length || attachedDocuments.some((document) => document.userId !== actor.userId)) {
      throw new ApiError(404, 'document_not_found', 'One or more context documents were not found.');
    }
    const resume = attachedDocuments.find((document) => document.kind === 'resume');
    if (modeRequiresVerifiedResume(input.mode) && !resume) throw new ApiError(422, 'resume_required', 'Attach a verified resume before starting an interview mode.');
    if (resume && resume.parseStatus !== 'verified') throw new ApiError(422, 'resume_not_verified', 'Review and verify the resume facts before starting.');
    if (attachedDocuments.some((document) => !['verified', 'ready'].includes(document.parseStatus))) {
      throw new ApiError(422, 'documents_not_ready', 'Wait for every context document to finish processing.');
    }

    const id = crypto.randomUUID();
    const now = Date.now();
    const targetNotes = JSON.parse(target[0].competenciesJson) as string[];
    const roundName = targetNotes.find((note) => note.startsWith('Interview round:'))?.slice('Interview round:'.length).trim()
      || (input.mode === 'meeting' ? 'Meeting' : `${input.mode.replace('-', ' ')} session`);
    const interviewer = targetNotes.find((note) => note.startsWith('Interviewer:'))?.slice('Interviewer:'.length).trim();
    const existingProcess = await db.select({ id: interviewProcesses.id }).from(interviewProcesses)
      .where(and(eq(interviewProcesses.userId, actor.userId), eq(interviewProcesses.jobTargetId, input.jobTargetId), eq(interviewProcesses.status, 'active'))).limit(1);
    const processId = existingProcess[0]?.id ?? crypto.randomUUID();
    if (!existingProcess[0]) {
      await db.insert(interviewProcesses).values({
        id: processId,
        userId: actor.userId,
        jobTargetId: input.jobTargetId,
        title: `${target[0].role}${target[0].company ? ` at ${target[0].company}` : ''}`,
        createdAt: now,
        updatedAt: now,
      });
    }
    const roundId = crypto.randomUUID();
    await db.batch([
      db.insert(interviewRounds).values({
        id: roundId,
        processId,
        userId: actor.userId,
        name: roundName,
        interviewerJson: JSON.stringify(interviewer ? [interviewer] : []),
        objective: targetNotes.find((note) => note.startsWith('Session objective:'))?.slice('Session objective:'.length).trim(),
        status: 'live',
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(sessions).values({
        id,
        userId: actor.userId,
        jobTargetId: input.jobTargetId,
        interviewRoundId: roundId,
        deviceId: input.deviceId,
        mode: input.mode,
        locale: input.locale,
        retentionChoice: input.retentionChoice,
        startedAt: now,
      }),
      db.insert(consentReceipts).values({
        id: crypto.randomUUID(),
        userId: actor.userId,
        sessionId: id,
        policyVersion: input.consent.policyVersion,
        recordingAllowed: input.consent.recordingAllowed,
        aiAssistanceAllowed: input.consent.aiAssistanceAllowed,
        createdAt: now,
      }),
      db.insert(devices).values({
        id: input.deviceId,
        userId: actor.userId,
        platform: request.headers.get('x-client-platform') ?? 'web',
        appVersion: request.headers.get('x-client-version'),
        lastSeenAt: now,
      }).onConflictDoUpdate({ target: devices.id, set: { lastSeenAt: now, appVersion: request.headers.get('x-client-version') } }),
      db.insert(auditEvents).values({
        id: crypto.randomUUID(),
        userId: actor.userId,
        action: 'session.created',
        resourceType: 'session',
        resourceId: id,
        metadataJson: JSON.stringify({ mode: input.mode, locale: input.locale, retentionChoice: input.retentionChoice, documentCount: documentIds.length }),
        createdAt: now,
      }),
    ]);
    if (documentIds.length) await db.insert(sessionDocuments).values(documentIds.map((documentId) => ({ sessionId: id, documentId, createdAt: now })));
    await compileSessionBrain(id, actor.userId).catch((error) => {
      console.warn(JSON.stringify({ level: 'warn', event: 'session_brain_compile_failed', sessionId: id, reason: error instanceof Error ? error.message : 'unknown' }));
    });
    return json({ id, status: 'created', quota }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
