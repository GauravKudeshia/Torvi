import { env } from 'cloudflare:workers';
import { requireActor } from '@/lib/auth';
import { ApiError, handleApiError, noStoreHeaders } from '@/lib/http';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, 'export_not_found', 'Export not found.');
    const object = await env.FILES.get(`users/${actor.userId}/exports/${id}.json`);
    if (!object) throw new ApiError(404, 'export_not_found', 'Export not found.');
    return new Response(object.body, {
      headers: noStoreHeaders({
        'content-type': 'application/json',
        'content-disposition': `attachment; filename="interview-copilot-export-${id}.json"`,
      }),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
