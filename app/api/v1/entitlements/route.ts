import { requireActor } from '@/lib/auth';
import { getDb } from '@/db';
import { handleApiError, json } from '@/lib/http';
import { quotaFor } from '@/lib/usage';

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    return json(await quotaFor(getDb(), actor.userId));
  } catch (error) {
    return handleApiError(error);
  }
}
