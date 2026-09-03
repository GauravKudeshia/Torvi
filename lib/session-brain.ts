import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { jobTargets, roundConcerns, sessionBrains, sessions } from '@/db/schema';
import { sha256Hex } from './crypto';
import { listProfessionalMemory } from './professional-memory';
import type { MemoryCandidate } from './professional-memory-domain';
import { buildEvidenceCoverage, isAutobiographicallyAllowed } from './professional-memory-domain';

export type SessionBrain = {
  generatedAt: number;
  target: { role: string; company: string | null; jobDescription: string | null } | null;
  verifiedMemory: MemoryCandidate[];
  evidenceCoverage: ReturnType<typeof buildEvidenceCoverage>;
  openConcerns: Array<{ id: string; category: string; summary: string }>;
  likelyQuestions: string[];
};

function likelyQuestions(role: string, competencies: string[]) {
  return [
    `Tell me about an experience that best demonstrates your fit for ${role}.`,
    ...competencies.slice(0, 4).map((competency) => `Can you give me a verified example of ${competency.toLocaleLowerCase()}?`),
  ].slice(0, 6);
}

export async function compileSessionBrain(sessionId: string, userId: string) {
  const db = getDb();
  const sessionRows = await db.select().from(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId))).limit(1);
  const session = sessionRows[0];
  if (!session) return null;
  const [targetRows, experiences, concerns] = await Promise.all([
    session.jobTargetId ? db.select().from(jobTargets).where(eq(jobTargets.id, session.jobTargetId)).limit(1) : Promise.resolve([]),
    listProfessionalMemory(userId),
    session.interviewRoundId ? db.select().from(roundConcerns).where(and(eq(roundConcerns.roundId, session.interviewRoundId), eq(roundConcerns.userId, userId))) : Promise.resolve([]),
  ]);
  const candidates: MemoryCandidate[] = experiences.flatMap((experience) => experience.claims.map((claim) => ({
    claimId: claim.id,
    experienceId: experience.id,
    experienceTitle: experience.title,
    company: experience.company,
    role: experience.role,
    startDate: experience.startDate,
    endDate: experience.endDate,
    claimText: claim.claimText,
    claimType: claim.claimType,
    knowledgeClass: claim.knowledgeClass,
    verificationStatus: claim.verificationStatus,
    sourceType: claim.sourceType,
    sourceId: claim.sourceId,
    evidenceExcerpt: claim.sourceExcerpt,
    allowedAsPersonalExperience: claim.allowedAsPersonalExperience,
    confidence: claim.confidence,
    technologies: experience.technologies,
    competencies: experience.competencies,
  }))).filter(isAutobiographicallyAllowed).slice(0, 80);
  const target = targetRows[0] ? { role: targetRows[0].role, company: targetRows[0].company, jobDescription: targetRows[0].jobDescription } : null;
  const coverage = buildEvidenceCoverage(candidates);
  const now = Date.now();
  const payload: SessionBrain = {
    generatedAt: now,
    target,
    verifiedMemory: candidates,
    evidenceCoverage: coverage,
    openConcerns: concerns.filter((concern) => concern.status !== 'dismissed').map((concern) => ({ id: concern.id, category: concern.category, summary: concern.summary })),
    likelyQuestions: likelyQuestions(target?.role ?? 'this role', coverage.filter((item) => item.strength !== 'missing').map((item) => item.competency)),
  };
  const sourceVersion = await sha256Hex(JSON.stringify({
    targetUpdatedAt: targetRows[0]?.updatedAt ?? 0,
    memory: experiences.map((experience) => [experience.id, experience.updatedAt]),
    concerns: concerns.map((concern) => [concern.id, concern.updatedAt, concern.status]),
  }));
  await db.insert(sessionBrains).values({
    sessionId, userId, sourceVersion, payloadJson: JSON.stringify(payload), createdAt: now, expiresAt: now + 24 * 60 * 60 * 1_000,
  }).onConflictDoUpdate({
    target: sessionBrains.sessionId,
    set: { sourceVersion, payloadJson: JSON.stringify(payload), createdAt: now, expiresAt: now + 24 * 60 * 60 * 1_000 },
  });
  return { sourceVersion, brain: payload };
}

export async function getSessionBrain(sessionId: string, userId: string) {
  const db = getDb();
  const rows = await db.select().from(sessionBrains)
    .where(and(eq(sessionBrains.sessionId, sessionId), eq(sessionBrains.userId, userId))).limit(1);
  if (!rows[0] || rows[0].expiresAt < Date.now()) return compileSessionBrain(sessionId, userId);
  try {
    return { sourceVersion: rows[0].sourceVersion, brain: JSON.parse(rows[0].payloadJson) as SessionBrain };
  } catch {
    return compileSessionBrain(sessionId, userId);
  }
}
