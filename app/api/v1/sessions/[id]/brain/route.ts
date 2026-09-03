import { requireActor } from '@/lib/auth';
import { getSessionBrain } from '@/lib/session-brain';
import { handleApiError, json } from '@/lib/http';
import { ownedSession } from '@/lib/session';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    const { id } = await context.params;
    await ownedSession(id, actor.userId);
    return json(await getSessionBrain(id, actor.userId));
  } catch (error) {
    return handleApiError(error);
  }
}
