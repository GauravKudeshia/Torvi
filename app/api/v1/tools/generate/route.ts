import { desc, eq } from 'drizzle-orm';
import { careerToolRequestSchema } from '@interview-copilot/contracts';
import { getDb } from '@/db';
import { auditEvents, careerArtifacts, profiles } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { handleApiError, json, parseJson } from '@/lib/http';
import { createCareerArtifact } from '@/lib/openai';
import { enforceRateLimit } from '@/lib/rate-limit';

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    const rows = await getDb().select().from(careerArtifacts)
      .where(eq(careerArtifacts.userId, actor.userId))
      .orderBy(desc(careerArtifacts.createdAt))
      .limit(30);
    return json({ artifacts: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      content: row.content,
      bullets: JSON.parse(row.bulletsJson),
      keywords: JSON.parse(row.keywordsJson),
      score: row.score,
      caution: row.caution,
      createdAt: row.createdAt,
    })) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(`career-tool:${actor.userId}`, 20, 60_000);
    const input = await parseJson(request, careerToolRequestSchema);
    const db = getDb();
    const profile = await db.select({ verifiedFactsJson: profiles.verifiedFactsJson })
      .from(profiles).where(eq(profiles.userId, actor.userId)).limit(1);
    const verifiedFacts = JSON.parse(profile[0]?.verifiedFactsJson ?? '[]') as string[];
    const result = await createCareerArtifact(input, verifiedFacts, actor.subject);
    const id = crypto.randomUUID();
    const now = Date.now();
    await db.batch([
      db.insert(careerArtifacts).values({
        id,
        userId: actor.userId,
        kind: input.kind,
        title: result.artifact.title,
        content: result.artifact.content,
        bulletsJson: JSON.stringify(result.artifact.bullets),
        keywordsJson: JSON.stringify(result.artifact.keywords),
        score: result.artifact.score,
        caution: result.artifact.caution,
        contextJson: JSON.stringify({ role: input.role, company: input.company, model: result.model }),
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(auditEvents).values({
        id: crypto.randomUUID(),
        userId: actor.userId,
        action: 'career_artifact.created',
        resourceType: 'career_artifact',
        resourceId: id,
        metadataJson: JSON.stringify({ kind: input.kind }),
        createdAt: now,
      }),
    ]);
    return json({ id, ...result.artifact }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
