import { interviewModes } from '@interview-copilot/contracts';
import { requireActor } from '@/lib/auth';
import { analyzeScreen } from '@/lib/openai';
import { ApiError, handleApiError, json } from '@/lib/http';
import { ownedSession } from '@/lib/session';
import { enforceRateLimit } from '@/lib/rate-limit';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(`screen-context:${actor.userId}`, 10, 60_000);
    const { id } = await context.params;
    const session = await ownedSession(id, actor.userId);
    const form = await request.formData();
    const image = form.get('image');
    if (!(image instanceof File)) throw new ApiError(422, 'image_required', 'Attach a screen image.');
    if (!interviewModes.includes(session.mode as (typeof interviewModes)[number])) throw new ApiError(422, 'invalid_mode', 'The session mode is invalid.');
    const analysis = await analyzeScreen(image, session.mode as (typeof interviewModes)[number], actor.subject);
    return json({ analysis, retained: false });
  } catch (error) {
    return handleApiError(error);
  }
}
