import { z } from 'zod';
import type { MemoryCandidate } from '@/lib/professional-memory-domain';
import { requireActor } from '@/lib/auth';
import { buildEvidenceCoverage } from '@/lib/professional-memory-domain';
import { handleApiError, json, parseJson } from '@/lib/http';
import { listProfessionalMemory } from '@/lib/professional-memory';

const coverageSchema = z.object({
  competencies: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
});

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    const input = await parseJson(request, coverageSchema);
    const experiences = await listProfessionalMemory(actor.userId);
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
    })));
    return json({ coverage: buildEvidenceCoverage(candidates, input.competencies) });
  } catch (error) {
    return handleApiError(error);
  }
}
