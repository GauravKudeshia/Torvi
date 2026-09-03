import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { experienceUses, interviewProcesses, interviewRounds, professionalExperiences, roundConcerns } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { ApiError, handleApiError, json } from '@/lib/http';
import { listProfessionalMemory } from '@/lib/professional-memory';
import type { MemoryCandidate } from '@/lib/professional-memory-domain';
import { buildEvidenceCoverage } from '@/lib/professional-memory-domain';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    const { id } = await context.params;
    const db = getDb();
    const processRows = await db.select().from(interviewProcesses)
      .where(and(eq(interviewProcesses.id, id), eq(interviewProcesses.userId, actor.userId))).limit(1);
    if (!processRows[0]) throw new ApiError(404, 'interview_process_not_found', 'Interview process not found.');
    const rounds = await db.select().from(interviewRounds)
      .where(and(eq(interviewRounds.processId, id), eq(interviewRounds.userId, actor.userId)));
    const roundIds = rounds.map((round) => round.id);
    const [concerns, uses, experiences] = await Promise.all([
      roundIds.length ? db.select().from(roundConcerns).where(inArray(roundConcerns.roundId, roundIds)) : Promise.resolve([]),
      roundIds.length ? db.select().from(experienceUses).where(inArray(experienceUses.roundId, roundIds)) : Promise.resolve([]),
      listProfessionalMemory(actor.userId),
    ]);
    const usedExperienceIds = new Set(uses.map((use) => use.experienceId));
    const experienceNames = new Map((await db.select({ id: professionalExperiences.id, title: professionalExperiences.title }).from(professionalExperiences)
      .where(eq(professionalExperiences.userId, actor.userId))).map((experience) => [experience.id, experience.title]));
    const candidates: MemoryCandidate[] = experiences.flatMap((experience) => experience.claims.map((claim) => ({
      claimId: claim.id, experienceId: experience.id, experienceTitle: experience.title, company: experience.company, role: experience.role,
      startDate: experience.startDate, endDate: experience.endDate, claimText: claim.claimText, claimType: claim.claimType,
      knowledgeClass: claim.knowledgeClass, verificationStatus: claim.verificationStatus, sourceType: claim.sourceType, sourceId: claim.sourceId,
      evidenceExcerpt: claim.sourceExcerpt, allowedAsPersonalExperience: claim.allowedAsPersonalExperience, confidence: claim.confidence,
      technologies: experience.technologies, competencies: experience.competencies,
    })));
    const coverage = buildEvidenceCoverage(candidates);
    return json({
      process: { id: processRows[0].id, title: processRows[0].title, status: processRows[0].status },
      whatTheyKnow: rounds.filter((round) => round.summary).map((round) => `${round.name}: ${round.summary}`).slice(-6),
      alreadyDiscussed: [...usedExperienceIds].flatMap((experienceId) => experienceNames.get(experienceId) ? [experienceNames.get(experienceId)!] : []),
      concerns: concerns.filter((concern) => concern.status !== 'dismissed').map((concern) => ({ id: concern.id, status: concern.status, category: concern.category, summary: concern.summary })),
      verifiedExperiencesToPrioritize: experiences.filter((experience) => !usedExperienceIds.has(experience.id) && experience.claims.some((claim) => ['verified', 'corrected'].includes(claim.verificationStatus))).slice(0, 6).map((experience) => experience.title),
      storiesNotYetUsed: experiences.filter((experience) => !usedExperienceIds.has(experience.id)).slice(0, 8).map((experience) => experience.title),
      evidenceGaps: coverage.filter((item) => item.strength === 'missing').map((item) => item.competency),
      suggestedPreparation: concerns.filter((concern) => concern.status !== 'dismissed').map((concern) => `Prepare verified evidence for: ${concern.summary}`).slice(0, 6),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
