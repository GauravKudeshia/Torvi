import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { auditEvents, careerArtifacts, claimEvidence, communicationProfiles, consentReceipts, devices, documents, entitlements, interviewProcesses, interviewRounds, jobApplications, jobTargets, professionalClaims, professionalExperiences, profiles, reports, roundConcerns, sessionCaptures, sessionDocuments, sessions, transcriptSegments, usageLedger, users } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { handleApiError, json } from '@/lib/http';

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    const db = getDb();
    const ownedSessions = await db.select().from(sessions).where(eq(sessions.userId, actor.userId));
    const segmentGroups = await Promise.all(ownedSessions.map((session) =>
      db.select().from(transcriptSegments).where(eq(transcriptSegments.sessionId, session.id))));
    const contextGroups = await Promise.all(ownedSessions.map((session) =>
      db.select().from(sessionDocuments).where(eq(sessionDocuments.sessionId, session.id))));
    const [user, profile, targets, applications, artifacts, docs, reportRows, entitlement, usage, consents, deviceRows, audit, experiences, claims, evidence, communication, processes, rounds, concerns, captures] = await Promise.all([
      db.select().from(users).where(eq(users.id, actor.userId)),
      db.select().from(profiles).where(eq(profiles.userId, actor.userId)),
      db.select().from(jobTargets).where(eq(jobTargets.userId, actor.userId)),
      db.select().from(jobApplications).where(eq(jobApplications.userId, actor.userId)),
      db.select().from(careerArtifacts).where(eq(careerArtifacts.userId, actor.userId)),
      db.select().from(documents).where(eq(documents.userId, actor.userId)),
      db.select().from(reports).where(eq(reports.userId, actor.userId)),
      db.select().from(entitlements).where(eq(entitlements.userId, actor.userId)),
      db.select().from(usageLedger).where(eq(usageLedger.userId, actor.userId)),
      db.select().from(consentReceipts).where(eq(consentReceipts.userId, actor.userId)),
      db.select().from(devices).where(eq(devices.userId, actor.userId)),
      db.select().from(auditEvents).where(eq(auditEvents.userId, actor.userId)),
      db.select().from(professionalExperiences).where(eq(professionalExperiences.userId, actor.userId)),
      db.select().from(professionalClaims).where(eq(professionalClaims.userId, actor.userId)),
      db.select().from(claimEvidence).where(eq(claimEvidence.userId, actor.userId)),
      db.select().from(communicationProfiles).where(eq(communicationProfiles.userId, actor.userId)),
      db.select().from(interviewProcesses).where(eq(interviewProcesses.userId, actor.userId)),
      db.select().from(interviewRounds).where(eq(interviewRounds.userId, actor.userId)),
      db.select().from(roundConcerns).where(eq(roundConcerns.userId, actor.userId)),
      db.select().from(sessionCaptures).where(eq(sessionCaptures.userId, actor.userId)),
    ]);
    const exportId = crypto.randomUUID();
    const objectKey = `users/${actor.userId}/exports/${exportId}.json`;
    const payload = {
      generatedAt: new Date().toISOString(),
      rawAudioStored: false,
      screenshotsStored: false,
      user: user[0],
      profile: profile[0],
      professionalMemory: { experiences, claims, evidence, communicationProfile: communication[0] },
      jobTargets: targets,
      jobApplications: applications,
      careerArtifacts: artifacts,
      documents: docs.map(({ extractedText, ...document }) => ({ ...document, extractedTextIncluded: Boolean(extractedText) })),
      sessions: ownedSessions.map((session, index) => ({ ...session, transcript: segmentGroups[index], attachedDocuments: contextGroups[index] })),
      reports: reportRows,
      interviewMemory: { processes, rounds, concerns },
      sessionCaptures: captures,
      entitlement: entitlement[0],
      usage,
      consents,
      devices: deviceRows,
      audit,
    };
    await env.FILES.put(objectKey, JSON.stringify(payload, null, 2), { httpMetadata: { contentType: 'application/json' } });
    return json({ exportId, downloadUrl: `/api/v1/privacy/export/${exportId}`, expiresInDays: 7 });
  } catch (error) {
    return handleApiError(error);
  }
}
