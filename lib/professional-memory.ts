import { and, desc, eq, inArray } from 'drizzle-orm';
import type {
  ProfessionalClaim,
  ProfessionalClaimAction,
  ProfessionalClaimType,
  ProfessionalExperience,
  ProfessionalSourceType,
} from '@interview-copilot/contracts';
import { getDb } from '@/db';
import {
  auditEvents,
  claimEvidence,
  documents,
  experienceUses,
  professionalClaims,
  professionalExperiences,
  sessionBrains,
} from '@/db/schema';
import { ApiError } from './http';
import { claimStateTransition, type MemoryCandidate, rankProfessionalMemory } from './professional-memory-domain';

function jsonStrings(value: string | null): string[] {
  try {
    const parsed = JSON.parse(value ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, 50) : [];
  } catch {
    return [];
  }
}

function claimType(value: string): ProfessionalClaimType {
  const allowed: ProfessionalClaimType[] = ['responsibility', 'technology', 'project', 'decision', 'challenge', 'tradeoff', 'outcome', 'metric', 'leadership', 'collaboration', 'conflict', 'failure-learning', 'other'];
  return allowed.includes(value as ProfessionalClaimType) ? value as ProfessionalClaimType : 'other';
}

function sourceType(value: string): ProfessionalSourceType {
  const allowed: ProfessionalSourceType[] = ['resume', 'supporting_document', 'user_entry', 'mock_interview', 'interview_session', 'meeting_session', 'imported_note'];
  return allowed.includes(value as ProfessionalSourceType) ? value as ProfessionalSourceType : 'imported_note';
}

export type ExtractedProfessionalFact = {
  claim: string;
  evidence: string;
  claimType?: ProfessionalClaimType;
  experienceTitle?: string;
  company?: string | null;
  role?: string | null;
  technologies?: string[];
  competencies?: string[];
  confidence?: number;
};

export async function persistProposedDocumentMemory(input: {
  userId: string;
  documentId: string;
  fileName: string;
  documentKind: 'resume' | 'job-description' | 'other';
  summary: string;
  facts: ExtractedProfessionalFact[];
}) {
  if (input.documentKind !== 'resume' || input.facts.length === 0) return [];
  const db = getDb();
  const existing = await db.select({ id: professionalExperiences.id }).from(professionalExperiences)
    .where(and(eq(professionalExperiences.userId, input.userId), eq(professionalExperiences.sourceDocumentId, input.documentId))).limit(1);
  if (existing[0]) return [existing[0].id];

  const groups = new Map<string, ExtractedProfessionalFact[]>();
  for (const fact of input.facts.slice(0, 80)) {
    const key = (fact.experienceTitle?.trim() || `Imported resume: ${input.fileName}`).slice(0, 240);
    groups.set(key, [...(groups.get(key) ?? []), fact]);
  }
  const now = Date.now();
  const experienceIds: string[] = [];
  const statements = [];
  for (const [title, facts] of groups) {
    const experienceId = crypto.randomUUID();
    experienceIds.push(experienceId);
    const technologies = [...new Set(facts.flatMap((fact) => fact.technologies ?? []))].slice(0, 50);
    const competencies = [...new Set(facts.flatMap((fact) => fact.competencies ?? []))].slice(0, 50);
    statements.push(db.insert(professionalExperiences).values({
      id: experienceId,
      userId: input.userId,
      sourceDocumentId: input.documentId,
      title,
      company: facts.find((fact) => fact.company)?.company ?? null,
      role: facts.find((fact) => fact.role)?.role ?? null,
      summary: input.summary.slice(0, 4_000),
      technologiesJson: JSON.stringify(technologies),
      competenciesJson: JSON.stringify(competencies),
      verificationStatus: 'proposed',
      confidence: Math.max(0, Math.min(1, facts.reduce((sum, fact) => sum + (fact.confidence ?? 0.6), 0) / facts.length)),
      createdAt: now,
      updatedAt: now,
    }));
    for (const fact of facts) {
      const claimId = crypto.randomUUID();
      const confidence = Math.max(0, Math.min(1, fact.confidence ?? 0.6));
      statements.push(db.insert(professionalClaims).values({
        id: claimId,
        experienceId,
        userId: input.userId,
        claimText: fact.claim.slice(0, 1_200),
        claimType: fact.claimType ?? 'other',
        knowledgeClass: 'VERIFIED_PERSONAL_FACT',
        sourceType: 'resume',
        sourceId: input.documentId,
        sourceExcerpt: fact.evidence.slice(0, 2_000),
        verificationStatus: 'proposed',
        confidence,
        allowedAsPersonalExperience: false,
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing());
      statements.push(db.insert(claimEvidence).values({
        id: crypto.randomUUID(),
        claimId,
        userId: input.userId,
        sourceType: 'resume',
        sourceId: input.documentId,
        excerpt: fact.evidence.slice(0, 2_000),
        confidence,
        createdAt: now,
      }).onConflictDoNothing());
    }
  }
  if (statements.length) await db.batch(statements as [typeof statements[number], ...typeof statements]);
  await db.delete(sessionBrains).where(eq(sessionBrains.userId, input.userId));
  return experienceIds;
}

function mapClaim(row: typeof professionalClaims.$inferSelect): ProfessionalClaim {
  return {
    id: row.id,
    experienceId: row.experienceId,
    claimText: row.claimText,
    claimType: claimType(row.claimType),
    knowledgeClass: row.knowledgeClass as ProfessionalClaim['knowledgeClass'],
    sourceType: sourceType(row.sourceType),
    sourceId: row.sourceId,
    sourceExcerpt: row.sourceExcerpt,
    sourceLocation: row.sourceLocation,
    verificationStatus: row.verificationStatus as ProfessionalClaim['verificationStatus'],
    verifiedAt: row.verifiedAt,
    userCorrection: row.userCorrection,
    confidence: row.confidence,
    allowedAsPersonalExperience: row.allowedAsPersonalExperience,
    sensitive: row.sensitive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listProfessionalMemory(userId: string): Promise<ProfessionalExperience[]> {
  const db = getDb();
  const experiences = await db.select().from(professionalExperiences)
    .where(eq(professionalExperiences.userId, userId)).orderBy(desc(professionalExperiences.updatedAt));
  if (!experiences.length) return [];
  const claims = await db.select().from(professionalClaims)
    .where(and(eq(professionalClaims.userId, userId), inArray(professionalClaims.experienceId, experiences.map((experience) => experience.id))))
    .orderBy(desc(professionalClaims.updatedAt));
  return experiences.map((experience) => ({
    id: experience.id,
    title: experience.title,
    company: experience.company,
    role: experience.role,
    startDate: experience.startDate,
    endDate: experience.endDate,
    context: experience.context,
    summary: experience.summary,
    technologies: jsonStrings(experience.technologiesJson),
    competencies: jsonStrings(experience.competenciesJson),
    verificationStatus: experience.verificationStatus as ProfessionalExperience['verificationStatus'],
    confidence: experience.confidence,
    sensitive: experience.sensitive,
    claims: claims.filter((claim) => claim.experienceId === experience.id).map(mapClaim),
    createdAt: experience.createdAt,
    updatedAt: experience.updatedAt,
  }));
}

export async function createProfessionalExperience(input: {
  userId: string;
  title: string;
  company?: string | null;
  role?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  context?: string | null;
  summary?: string | null;
  technologies?: string[];
  competencies?: string[];
  claims: Array<{ claimText: string; claimType: ProfessionalClaimType; sourceType?: ProfessionalSourceType; sourceId?: string | null; sourceExcerpt?: string | null }>;
  claimsVerified?: boolean;
}) {
  const db = getDb();
  const now = Date.now();
  const experienceId = crypto.randomUUID();
  const claimStatus = input.claimsVerified ? 'verified' : 'proposed';
  const statements = [
    db.insert(professionalExperiences).values({
      id: experienceId,
      userId: input.userId,
      title: input.title,
      company: input.company ?? null,
      role: input.role ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      context: input.context ?? null,
      summary: input.summary ?? null,
      technologiesJson: JSON.stringify(input.technologies ?? []),
      competenciesJson: JSON.stringify(input.competencies ?? []),
      verificationStatus: claimStatus,
      confidence: input.claimsVerified ? 1 : 0.7,
      createdAt: now,
      updatedAt: now,
    }),
    ...input.claims.map((claim) => db.insert(professionalClaims).values({
      id: crypto.randomUUID(),
      experienceId,
      userId: input.userId,
      claimText: claim.claimText,
      claimType: claim.claimType,
      knowledgeClass: 'VERIFIED_PERSONAL_FACT',
      sourceType: claim.sourceType ?? 'user_entry',
      sourceId: claim.sourceId ?? null,
      sourceExcerpt: claim.sourceExcerpt ?? null,
      verificationStatus: claimStatus,
      verifiedAt: input.claimsVerified ? now : null,
      allowedAsPersonalExperience: Boolean(input.claimsVerified),
      confidence: input.claimsVerified ? 1 : 0.7,
      createdAt: now,
      updatedAt: now,
    })),
  ];
  await db.batch(statements as [typeof statements[number], ...Array<typeof statements[number]>]);
  await db.delete(sessionBrains).where(eq(sessionBrains.userId, input.userId));
  return experienceId;
}

export async function applyProfessionalClaimAction(userId: string, claimId: string, input: ProfessionalClaimAction) {
  const db = getDb();
  const rows = await db.select().from(professionalClaims)
    .where(and(eq(professionalClaims.id, claimId), eq(professionalClaims.userId, userId))).limit(1);
  const claim = rows[0];
  if (!claim) throw new ApiError(404, 'claim_not_found', 'Professional-memory claim not found.');
  const state = claimStateTransition(claim.verificationStatus as ProfessionalClaim['verificationStatus'], input.action);
  const now = Date.now();
  const update = input.action === 'mark_private'
    ? { sensitive: input.sensitive, updatedAt: now }
    : {
      verificationStatus: state.verificationStatus,
      allowedAsPersonalExperience: state.allowedAsPersonalExperience,
      verifiedAt: ['confirm', 'correct'].includes(input.action) ? now : null,
      claimText: input.action === 'correct' ? input.claimText : claim.claimText,
      userCorrection: input.action === 'correct' ? input.claimText : claim.userCorrection,
      updatedAt: now,
    };
  await db.batch([
    db.update(professionalClaims).set(update).where(and(eq(professionalClaims.id, claimId), eq(professionalClaims.userId, userId))),
    db.insert(auditEvents).values({
      id: crypto.randomUUID(), userId, action: `professional_claim.${input.action}`, resourceType: 'professional_claim',
      resourceId: claimId, metadataJson: JSON.stringify({ previousStatus: claim.verificationStatus, nextStatus: state.verificationStatus }), createdAt: now,
    }),
  ]);
  if (claim.experienceId) await refreshExperienceVerification(userId, claim.experienceId);
  await db.delete(sessionBrains).where(eq(sessionBrains.userId, userId));
  const updated = await db.select().from(professionalClaims)
    .where(and(eq(professionalClaims.id, claimId), eq(professionalClaims.userId, userId))).limit(1);
  return mapClaim(updated[0]);
}

async function refreshExperienceVerification(userId: string, experienceId: string) {
  const db = getDb();
  const claims = await db.select({ status: professionalClaims.verificationStatus }).from(professionalClaims)
    .where(and(eq(professionalClaims.userId, userId), eq(professionalClaims.experienceId, experienceId)));
  const active = claims.filter((claim) => claim.status !== 'rejected');
  const nextStatus = active.length && active.every((claim) => ['verified', 'corrected'].includes(claim.status))
    ? 'verified'
    : active.some((claim) => ['verified', 'corrected'].includes(claim.status)) ? 'corrected' : 'proposed';
  await db.update(professionalExperiences).set({ verificationStatus: nextStatus, updatedAt: Date.now() })
    .where(and(eq(professionalExperiences.id, experienceId), eq(professionalExperiences.userId, userId)));
}

export async function deleteProfessionalClaim(userId: string, claimId: string) {
  const db = getDb();
  const rows = await db.select({ id: professionalClaims.id, experienceId: professionalClaims.experienceId }).from(professionalClaims)
    .where(and(eq(professionalClaims.id, claimId), eq(professionalClaims.userId, userId))).limit(1);
  if (!rows[0]) throw new ApiError(404, 'claim_not_found', 'Professional-memory claim not found.');
  await db.delete(professionalClaims).where(and(eq(professionalClaims.id, claimId), eq(professionalClaims.userId, userId)));
  await db.delete(sessionBrains).where(eq(sessionBrains.userId, userId));
  if (rows[0].experienceId) await refreshExperienceVerification(userId, rows[0].experienceId);
}

export async function rankedMemoryForSession(input: {
  userId: string;
  sessionId: string;
  question: string;
  role?: string | null;
  company?: string | null;
  jobDescription?: string | null;
}) {
  const db = getDb();
  const [brainRows, uses] = await Promise.all([
    db.select({ payloadJson: sessionBrains.payloadJson, expiresAt: sessionBrains.expiresAt }).from(sessionBrains)
      .where(and(eq(sessionBrains.sessionId, input.sessionId), eq(sessionBrains.userId, input.userId))).limit(1),
    db.select({ claimId: experienceUses.claimId }).from(experienceUses)
      .where(and(eq(experienceUses.userId, input.userId), eq(experienceUses.sessionId, input.sessionId))),
  ]);
  if (brainRows[0] && brainRows[0].expiresAt >= Date.now()) {
    try {
      const parsed = JSON.parse(brainRows[0].payloadJson) as { verifiedMemory?: MemoryCandidate[] };
      if (parsed.verifiedMemory?.length) return rankProfessionalMemory(input.question, parsed.verifiedMemory, {
        role: input.role,
        company: input.company,
        jobDescription: input.jobDescription,
        usedClaimIds: uses.flatMap((use) => use.claimId ? [use.claimId] : []),
      });
    } catch {
      // Invalid derived cache is ignored; canonical memory remains the fallback.
    }
  }
  const [experiences, claims] = await Promise.all([
    db.select().from(professionalExperiences).where(eq(professionalExperiences.userId, input.userId)),
    db.select().from(professionalClaims).where(eq(professionalClaims.userId, input.userId)),
  ]);
  const experienceMap = new Map(experiences.map((experience) => [experience.id, experience]));
  const candidates: MemoryCandidate[] = claims.flatMap((claim) => {
    if (!claim.experienceId) return [];
    const experience = experienceMap.get(claim.experienceId);
    if (!experience) return [];
    return [{
      claimId: claim.id,
      experienceId: experience.id,
      experienceTitle: experience.title,
      company: experience.company,
      role: experience.role,
      startDate: experience.startDate,
      endDate: experience.endDate,
      claimText: claim.claimText,
      claimType: claimType(claim.claimType),
      knowledgeClass: claim.knowledgeClass as MemoryCandidate['knowledgeClass'],
      verificationStatus: claim.verificationStatus as MemoryCandidate['verificationStatus'],
      sourceType: sourceType(claim.sourceType),
      sourceId: claim.sourceId,
      evidenceExcerpt: claim.sourceExcerpt,
      allowedAsPersonalExperience: claim.allowedAsPersonalExperience,
      confidence: claim.confidence,
      technologies: jsonStrings(experience.technologiesJson),
      competencies: jsonStrings(experience.competenciesJson),
    }];
  });
  return rankProfessionalMemory(input.question, candidates, {
    role: input.role,
    company: input.company,
    jobDescription: input.jobDescription,
    usedClaimIds: uses.flatMap((use) => use.claimId ? [use.claimId] : []),
  });
}

export async function markExperienceClaimsUsed(input: { userId: string; sessionId: string; roundId?: string | null; claimIds: string[]; questionFingerprint: string }) {
  if (!input.claimIds.length) return;
  const db = getDb();
  const claims = await db.select({ id: professionalClaims.id, experienceId: professionalClaims.experienceId }).from(professionalClaims)
    .where(and(eq(professionalClaims.userId, input.userId), inArray(professionalClaims.id, input.claimIds.slice(0, 12))));
  const statements = claims.flatMap((claim) => claim.experienceId ? [db.insert(experienceUses).values({
    id: crypto.randomUUID(), userId: input.userId, sessionId: input.sessionId, roundId: input.roundId ?? null,
    experienceId: claim.experienceId, claimId: claim.id, questionFingerprint: input.questionFingerprint, createdAt: Date.now(),
  })] : []);
  if (statements.length) await db.batch(statements as [typeof statements[number], ...typeof statements]);
}

export async function documentProvenanceLabel(documentId: string) {
  const db = getDb();
  const rows = await db.select({ fileName: documents.fileName }).from(documents).where(eq(documents.id, documentId)).limit(1);
  return rows[0]?.fileName ?? 'Imported source';
}
