import { requireActor } from '@/lib/auth';
import { listAiProviders } from '@/lib/ai/providers';
import { handleApiError, json } from '@/lib/http';

export async function GET(request: Request) {
  try {
    await requireActor(request);
    return json({ providers: listAiProviders(), defaultProvider: 'openai' });
  } catch (error) {
    return handleApiError(error);
  }
}
