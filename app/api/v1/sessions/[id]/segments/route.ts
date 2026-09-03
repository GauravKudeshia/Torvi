import { z } from 'zod';
import { transcriptSegmentSchema } from '@interview-copilot/contracts';
import { getDb } from '@/db';
import { transcriptSegments } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { handleApiError, json, parseJson } from '@/lib/http';
import { ownedSession } from '@/lib/session';

const segmentBatchSchema = z.union([
  transcriptSegmentSchema,
  z.object({ segments: z.array(transcriptSegmentSchema).min(1).max(100) }),
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    const { id } = await context.params;
    const session = await ownedSession(id, actor.userId);
    const input = await parseJson(request, segmentBatchSchema);
    const segments = 'segments' in input ? input.segments : [input];
    if (session.retentionChoice !== 'save') {
      return json({ accepted: segments.length, persisted: false, retention: 'ephemeral' });
    }
    const now = Date.now();
    await Promise.all(segments.map((segment) => getDb().insert(transcriptSegments).values({
        id: segment.id,
        sessionId: id,
        speaker: segment.speaker,
        text: segment.text,
        startedAtMs: segment.startedAtMs,
        endedAtMs: segment.endedAtMs,
        itemId: segment.itemId,
        createdAt: now,
      }).onConflictDoNothing()));
    return json({ accepted: segments.length, persisted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
