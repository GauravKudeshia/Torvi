import { desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { interviewProcesses, interviewRounds, roundConcerns } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { handleApiError, json } from '@/lib/http';

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    const db = getDb();
    const processes = await db.select().from(interviewProcesses)
      .where(eq(interviewProcesses.userId, actor.userId)).orderBy(desc(interviewProcesses.updatedAt)).limit(30);
    const rounds = processes.length ? await db.select().from(interviewRounds)
      .where(inArray(interviewRounds.processId, processes.map((process) => process.id))).orderBy(desc(interviewRounds.createdAt)) : [];
    const concerns = rounds.length ? await db.select().from(roundConcerns)
      .where(inArray(roundConcerns.roundId, rounds.map((round) => round.id))).orderBy(desc(roundConcerns.createdAt)) : [];
    return json({
      processes: processes.map((process) => ({
        ...process,
        rounds: rounds.filter((round) => round.processId === process.id).map((round) => ({
          ...round,
          interviewers: JSON.parse(round.interviewerJson),
          interviewerJson: undefined,
          concerns: concerns.filter((concern) => concern.roundId === round.id),
        })),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
