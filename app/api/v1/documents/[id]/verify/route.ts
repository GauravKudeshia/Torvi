import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { documents, professionalClaims, professionalExperiences, profiles } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { ApiError, handleApiError, json, parseJson } from '@/lib/http';

const verifySchema = z.object({ facts: z.array(z.string().trim().min(1).max(800)).max(80) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    const { id } = await context.params;
    const input = await parseJson(request, verifySchema);
    const db = getDb();
    const rows = await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.userId, actor.userId))).limit(1);
    const document = rows[0];
    if (!document) throw new ApiError(404, 'document_not_found', 'Document not found.');
    const candidates = JSON.parse(document.verifiedFactsJson) as Array<string | { claim: string }>;
    const allowed = new Set(candidates.map((item) => typeof item === 'string' ? item : item.claim));
    if (input.facts.some((fact) => !allowed.has(fact))) throw new ApiError(422, 'unverified_fact', 'Every selected fact must come from the parsed document.');
    const profile = await db.select({ facts: profiles.verifiedFactsJson }).from(profiles).where(eq(profiles.userId, actor.userId)).limit(1);
    const existing = JSON.parse(profile[0]?.facts ?? '[]') as string[];
    const merged = [...new Set([...existing, ...input.facts])].slice(0, 80);
    const now = Date.now();
    const memoryClaims = await db.select({ id: professionalClaims.id, claimText: professionalClaims.claimText, experienceId: professionalClaims.experienceId })
      .from(professionalClaims).where(and(eq(professionalClaims.userId, actor.userId), eq(professionalClaims.sourceId, id)));
    const selected = new Set(input.facts);
    const memoryUpdates = memoryClaims.filter((claim) => selected.has(claim.claimText)).map((claim) => db.update(professionalClaims).set({
      verificationStatus: 'verified', verifiedAt: now, allowedAsPersonalExperience: true, updatedAt: now,
    }).where(and(eq(professionalClaims.id, claim.id), eq(professionalClaims.userId, actor.userId))));
    const experienceIds = [...new Set(memoryClaims.flatMap((claim) => claim.experienceId ? [claim.experienceId] : []))];
    await db.batch([
      db.update(documents).set({ parseStatus: 'verified', verifiedFactsJson: JSON.stringify(input.facts), updatedAt: Date.now() }).where(eq(documents.id, id)),
      db.insert(profiles).values({ userId: actor.userId, verifiedFactsJson: JSON.stringify(merged), updatedAt: Date.now() })
        .onConflictDoUpdate({ target: profiles.userId, set: { verifiedFactsJson: JSON.stringify(merged), updatedAt: Date.now() } }),
    ]);
    await Promise.all([
      ...memoryUpdates,
      ...experienceIds.map((experienceId) => db.update(professionalExperiences).set({ verificationStatus: 'corrected', updatedAt: now })
        .where(and(eq(professionalExperiences.id, experienceId), eq(professionalExperiences.userId, actor.userId)))),
    ]);
    return json({ verified: true, verifiedFacts: merged });
  } catch (error) {
    return handleApiError(error);
  }
}
