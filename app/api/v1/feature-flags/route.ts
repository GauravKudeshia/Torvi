import { requireActor } from '@/lib/auth';
import { resolvedFeatureFlags } from '@/lib/feature-flags';
import { handleApiError, json } from '@/lib/http';

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    return json({ flags: await resolvedFeatureFlags(actor.userId) });
  } catch (error) {
    return handleApiError(error);
  }
}
