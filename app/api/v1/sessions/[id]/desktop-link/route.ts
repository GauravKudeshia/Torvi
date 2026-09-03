import { getDb } from '@/db';
import { auditEvents, desktopHandoffs } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { sha256Hex } from '@/lib/crypto';
import { ApiError, handleApiError, json } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rate-limit';
import { ownedSession } from '@/lib/session';

const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function connectionCode(): { display: string; normalized: string } {
  const random = crypto.getRandomValues(new Uint8Array(10));
  const characters = [...random].map((byte) => alphabet[byte % alphabet.length]);
  return { display: `${characters.slice(0, 5).join('')}-${characters.slice(5).join('')}`, normalized: characters.join('') };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(`desktop-link:${actor.userId}`, 10, 60_000);
    const { id } = await context.params;
    const session = await ownedSession(id, actor.userId);
    if (['discarded', 'saved'].includes(session.status)) {
      throw new ApiError(409, 'session_closed', 'This session is already closed.');
    }

    const code = connectionCode();
    const now = Date.now();
    const expiresAt = now + 5 * 60_000;
    const db = getDb();
    await db.batch([
      db.insert(desktopHandoffs).values({
        id: crypto.randomUUID(),
        userId: actor.userId,
        sessionId: id,
        codeHash: await sha256Hex(`desktop-handoff:v1:${code.normalized}`),
        expiresAt,
        createdAt: now,
      }),
      db.insert(auditEvents).values({
        id: crypto.randomUUID(),
        userId: actor.userId,
        action: 'desktop.handoff_created',
        resourceType: 'session',
        resourceId: id,
        metadataJson: JSON.stringify({ expiresAt }),
        createdAt: now,
      }),
    ]);
    return json({ code: code.display, sessionId: id, expiresAt });
  } catch (error) {
    return handleApiError(error);
  }
}
