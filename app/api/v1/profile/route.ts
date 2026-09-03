import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { profiles, users } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { handleApiError, json, parseJson } from '@/lib/http';

const profileSchema = z.object({
  displayName: z.string().trim().max(120).nullable().optional(),
  headline: z.string().trim().max(240).nullable().optional(),
  summary: z.string().trim().max(4_000).nullable().optional(),
  locale: z.enum(['en', 'es', 'fr', 'de', 'hi']).optional(),
  verifiedFacts: z.array(z.string().trim().min(1).max(800)).max(80).optional(),
  preferences: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    const db = getDb();
    const result = await db.select({
      displayName: users.displayName,
      locale: users.locale,
      headline: profiles.headline,
      summary: profiles.summary,
      facts: profiles.verifiedFactsJson,
      preferences: profiles.preferencesJson,
    }).from(users).leftJoin(profiles, eq(users.id, profiles.userId)).where(eq(users.id, actor.userId)).limit(1);
    const row = result[0];
    return json({
      userId: actor.userId,
      displayName: row?.displayName,
      locale: row?.locale ?? 'en',
      headline: row?.headline,
      summary: row?.summary,
      verifiedFacts: JSON.parse(row?.facts ?? '[]'),
      preferences: JSON.parse(row?.preferences ?? '{}'),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireActor(request);
    const input = await parseJson(request, profileSchema);
    const db = getDb();
    const now = Date.now();
    await db.batch([
      db.update(users).set({ displayName: input.displayName, locale: input.locale, updatedAt: now }).where(eq(users.id, actor.userId)),
      db.insert(profiles).values({
        userId: actor.userId,
        headline: input.headline,
        summary: input.summary,
        verifiedFactsJson: JSON.stringify(input.verifiedFacts ?? []),
        preferencesJson: JSON.stringify(input.preferences ?? {}),
        updatedAt: now,
      }).onConflictDoUpdate({
        target: profiles.userId,
        set: {
          headline: input.headline,
          summary: input.summary,
          verifiedFactsJson: input.verifiedFacts ? JSON.stringify(input.verifiedFacts) : undefined,
          preferencesJson: input.preferences ? JSON.stringify(input.preferences) : undefined,
          updatedAt: now,
        },
      }),
    ]);
    return json({ updated: true });
  } catch (error) {
    return handleApiError(error);
  }
}
