import { and, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { auditEvents, desktopHandoffs, devices, sessions } from '@/db/schema';
import { sha256Hex } from '@/lib/crypto';
import { createDesktopToken } from '@/lib/desktop-auth';
import { ApiError, handleApiError, json, parseJson } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rate-limit';

const exchangeSchema = z.object({
  code: z.string().trim().min(8).max(16).transform((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, '')),
  deviceName: z.string().trim().min(1).max(120).default('Mac'),
  appVersion: z.string().trim().min(1).max(32).default('0.1.0'),
});

function clientKey(request: Request): string {
  return request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown';
}

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, exchangeSchema);
    if (input.code.length !== 10) throw new ApiError(422, 'invalid_connection_code', 'Enter the complete 10-character connection code.');
    const fingerprint = (await sha256Hex(`desktop-exchange:${clientKey(request)}`)).slice(0, 24);
    await enforceRateLimit(`desktop-exchange:${fingerprint}`, 12, 5 * 60_000);
    const codeHash = await sha256Hex(`desktop-handoff:v1:${input.code}`);
    const db = getDb();
    const now = Date.now();
    const handoffs = await db.select().from(desktopHandoffs)
      .where(and(eq(desktopHandoffs.codeHash, codeHash), isNull(desktopHandoffs.consumedAt), gt(desktopHandoffs.expiresAt, now)))
      .limit(1);
    const handoff = handoffs[0];
    if (!handoff) throw new ApiError(401, 'invalid_connection_code', 'The connection code is invalid or expired. Generate a new code in the web session.');

    const claimed = await db.update(desktopHandoffs).set({ consumedAt: now })
      .where(and(eq(desktopHandoffs.id, handoff.id), isNull(desktopHandoffs.consumedAt), gt(desktopHandoffs.expiresAt, now)))
      .returning({ id: desktopHandoffs.id });
    if (!claimed[0]) throw new ApiError(409, 'connection_code_used', 'That connection code was already used. Generate a new code.');

    const sessionRows = await db.select({ id: sessions.id, status: sessions.status }).from(sessions)
      .where(and(eq(sessions.id, handoff.sessionId), eq(sessions.userId, handoff.userId))).limit(1);
    if (!sessionRows[0] || ['discarded', 'saved'].includes(sessionRows[0].status)) {
      throw new ApiError(409, 'session_closed', 'The linked interview session is closed.');
    }

    const deviceId = crypto.randomUUID();
    const token = await createDesktopToken({ userId: handoff.userId, deviceId, sessionId: handoff.sessionId });
    await db.batch([
      db.insert(devices).values({
        id: deviceId,
        userId: handoff.userId,
        platform: 'macos',
        name: input.deviceName,
        appVersion: input.appVersion,
        lastSeenAt: now,
      }),
      db.insert(auditEvents).values({
        id: crypto.randomUUID(),
        userId: handoff.userId,
        action: 'desktop.connected',
        resourceType: 'device',
        resourceId: deviceId,
        metadataJson: JSON.stringify({ sessionId: handoff.sessionId, platform: 'macos', appVersion: input.appVersion }),
        createdAt: now,
      }),
    ]);
    return json({
      token: token.token,
      tokenExpiresAt: token.expiresAt,
      sessionId: handoff.sessionId,
      deviceId,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
