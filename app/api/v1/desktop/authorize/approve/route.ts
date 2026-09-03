import { and, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { auditEvents, desktopAuthorizations, devices } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { sha256Hex } from '@/lib/crypto';
import { ApiError, handleApiError, json, parseJson } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rate-limit';

const inputSchema = z.object({ userCode: z.string().trim().min(8).max(12) });

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(`desktop-authorize-approve:${actor.userId}`, 12, 10 * 60_000);
    const input = await parseJson(request, inputSchema);
    const normalized = input.userCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const now = Date.now();
    const db = getDb();
    const rows = await db.select().from(desktopAuthorizations).where(and(
      eq(desktopAuthorizations.userCodeHash, await sha256Hex(`desktop-user:${normalized}`)),
      eq(desktopAuthorizations.status, 'pending'),
      gt(desktopAuthorizations.expiresAt, now),
    )).limit(1);
    const authorization = rows[0];
    if (!authorization) throw new ApiError(404, 'desktop_code_invalid', 'This Mac sign-in code is invalid or expired. Start again from the Mac app.');
    const deviceId = crypto.randomUUID();
    const claimed = await db.update(desktopAuthorizations).set({
      status: 'claiming', userId: actor.userId, approvedAt: now,
    }).where(and(eq(desktopAuthorizations.id, authorization.id), eq(desktopAuthorizations.status, 'pending'))).returning({ id: desktopAuthorizations.id });
    if (!claimed[0]) throw new ApiError(409, 'desktop_code_used', 'This Mac sign-in code was already approved.');
    await db.batch([
      db.insert(devices).values({
        id: deviceId,
        userId: actor.userId,
        platform: 'macos',
        name: authorization.deviceName,
        appVersion: authorization.appVersion,
        lastSeenAt: now,
      }),
      db.update(desktopAuthorizations).set({ status: 'approved', deviceId })
        .where(and(eq(desktopAuthorizations.id, authorization.id), eq(desktopAuthorizations.status, 'claiming'))),
      db.insert(auditEvents).values({
        id: crypto.randomUUID(),
        userId: actor.userId,
        action: 'desktop.account_authorized',
        resourceType: 'device',
        resourceId: deviceId,
        metadataJson: JSON.stringify({ platform: 'macos', appVersion: authorization.appVersion }),
        createdAt: now,
      }),
    ]);
    return json({ approved: true, deviceName: authorization.deviceName });
  } catch (error) {
    return handleApiError(error);
  }
}
