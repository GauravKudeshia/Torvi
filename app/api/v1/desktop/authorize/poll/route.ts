import { and, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { desktopAuthorizations } from '@/db/schema';
import { sha256Hex } from '@/lib/crypto';
import { createDesktopAccountToken } from '@/lib/desktop-auth';
import { ApiError, handleApiError, json, parseJson } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rate-limit';
import { ensureRuntimeSchema } from '@/db/runtime-schema';

const inputSchema = z.object({ deviceCode: z.string().trim().min(32).max(96) });

export async function POST(request: Request) {
  try {
    await ensureRuntimeSchema();
    const input = await parseJson(request, inputSchema);
    const deviceCodeHash = await sha256Hex(`desktop-device:${input.deviceCode}`);
    await enforceRateLimit(`desktop-authorize-poll:${deviceCodeHash.slice(0, 24)}`, 180, 10 * 60_000);
    const now = Date.now();
    const db = getDb();
    const rows = await db.select().from(desktopAuthorizations).where(and(
      eq(desktopAuthorizations.deviceCodeHash, deviceCodeHash),
      gt(desktopAuthorizations.expiresAt, now),
    )).limit(1);
    const authorization = rows[0];
    if (!authorization) throw new ApiError(410, 'desktop_code_expired', 'The Mac sign-in request expired. Start again.');
    if (!authorization.userId || !authorization.deviceId || authorization.status === 'pending') {
      return json({ status: 'pending', expiresAt: authorization.expiresAt }, { status: 202 });
    }
    const token = await createDesktopAccountToken({ userId: authorization.userId, deviceId: authorization.deviceId });
    await db.update(desktopAuthorizations).set({ status: 'consumed', consumedAt: now }).where(eq(desktopAuthorizations.id, authorization.id));
    return json({
      status: 'approved',
      token: token.token,
      tokenExpiresAt: token.expiresAt,
      deviceId: authorization.deviceId,
      scope: 'account',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
