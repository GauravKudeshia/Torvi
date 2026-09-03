import { eq } from 'drizzle-orm';
import { communicationProfileSchema } from '@interview-copilot/contracts';
import { getDb } from '@/db';
import { communicationProfiles } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { handleApiError, json, parseJson } from '@/lib/http';

function response(row: typeof communicationProfiles.$inferSelect | undefined) {
  return communicationProfileSchema.parse(row ? {
    preferredAnswerLength: row.preferredAnswerLength,
    technicalDepth: row.technicalDepth,
    tone: row.tone,
    firstPersonStyle: row.firstPersonStyle,
    bulletPreference: row.bulletPreference,
    explanationDepth: row.explanationDepth,
    vocabularyPreferences: JSON.parse(row.vocabularyPreferencesJson),
  } : {});
}

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    const db = getDb();
    const rows = await db.select().from(communicationProfiles).where(eq(communicationProfiles.userId, actor.userId)).limit(1);
    return json({ communicationProfile: response(rows[0]) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireActor(request);
    const input = await parseJson(request, communicationProfileSchema);
    const db = getDb();
    await db.insert(communicationProfiles).values({
      userId: actor.userId,
      preferredAnswerLength: input.preferredAnswerLength,
      technicalDepth: input.technicalDepth,
      tone: input.tone,
      firstPersonStyle: input.firstPersonStyle,
      bulletPreference: input.bulletPreference,
      explanationDepth: input.explanationDepth,
      vocabularyPreferencesJson: JSON.stringify(input.vocabularyPreferences),
      updatedAt: Date.now(),
    }).onConflictDoUpdate({
      target: communicationProfiles.userId,
      set: {
        preferredAnswerLength: input.preferredAnswerLength,
        technicalDepth: input.technicalDepth,
        tone: input.tone,
        firstPersonStyle: input.firstPersonStyle,
        bulletPreference: input.bulletPreference,
        explanationDepth: input.explanationDepth,
        vocabularyPreferencesJson: JSON.stringify(input.vocabularyPreferences),
        updatedAt: Date.now(),
      },
    });
    return json({ communicationProfile: input });
  } catch (error) {
    return handleApiError(error);
  }
}
