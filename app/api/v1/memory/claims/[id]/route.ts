import { and, eq } from 'drizzle-orm';
import { professionalClaimActionSchema } from '@interview-copilot/contracts';
import { getDb } from '@/db';
import { professionalClaims } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { ApiError, handleApiError, json, parseJson } from '@/lib/http';
import { applyProfessionalClaimAction, deleteProfessionalClaim } from '@/lib/professional-memory';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    const { id } = await context.params;
    const input = await parseJson(request, professionalClaimActionSchema);
    const claim = await applyProfessionalClaimAction(actor.userId, id, input);
    return json({ claim });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    const { id } = await context.params;
    const db = getDb();
    const claim = await db.select({ id: professionalClaims.id }).from(professionalClaims)
      .where(and(eq(professionalClaims.id, id), eq(professionalClaims.userId, actor.userId))).limit(1);
    if (!claim[0]) throw new ApiError(404, 'claim_not_found', 'Professional-memory claim not found.');
    await deleteProfessionalClaim(actor.userId, id);
    return json({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
