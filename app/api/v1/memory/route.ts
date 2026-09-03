import { z } from 'zod';
import { professionalClaimTypes, professionalSourceTypes } from '@interview-copilot/contracts';
import { requireActor } from '@/lib/auth';
import { handleApiError, json, parseJson } from '@/lib/http';
import { createProfessionalExperience, listProfessionalMemory } from '@/lib/professional-memory';

const createExperienceSchema = z.object({
  title: z.string().trim().min(1).max(240),
  company: z.string().trim().max(180).nullable().optional(),
  role: z.string().trim().max(180).nullable().optional(),
  startDate: z.string().trim().max(40).nullable().optional(),
  endDate: z.string().trim().max(40).nullable().optional(),
  context: z.string().trim().max(4_000).nullable().optional(),
  summary: z.string().trim().max(4_000).nullable().optional(),
  technologies: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  competencies: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  claims: z.array(z.object({
    claimText: z.string().trim().min(1).max(1_200),
    claimType: z.enum(professionalClaimTypes).default('other'),
    sourceType: z.enum(professionalSourceTypes).default('user_entry'),
    sourceId: z.string().max(128).nullable().optional(),
    sourceExcerpt: z.string().max(2_000).nullable().optional(),
  })).min(1).max(40),
  confirmAsAccurate: z.literal(true),
});

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    const experiences = await listProfessionalMemory(actor.userId);
    const summary = experiences.reduce((counts, experience) => {
      for (const claim of experience.claims) counts[claim.verificationStatus] = (counts[claim.verificationStatus] ?? 0) + 1;
      return counts;
    }, {} as Record<string, number>);
    return json({ experiences, summary });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    const input = await parseJson(request, createExperienceSchema);
    const id = await createProfessionalExperience({ ...input, userId: actor.userId, claimsVerified: true });
    return json({ id, verified: true }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
