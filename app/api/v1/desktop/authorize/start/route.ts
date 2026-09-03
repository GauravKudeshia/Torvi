import { env } from 'cloudflare:workers';
import { sha256Hex } from '@/lib/crypto';
import { enforceRateLimit } from '@/lib/rate-limit';
import { handleApiError, json, parseJson } from '@/lib/http';
import { z } from 'zod';
import { ensureRuntimeSchema } from '@/db/runtime-schema';

const inputSchema = z.object({
  deviceName: z.string().trim().min(1).max(120),
  appVersion: z.string().trim().min(1).max(32),
});

function randomCode(length: number, alphabet: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

export async function POST(request: Request) {
  try {
    await ensureRuntimeSchema();
    const input = await parseJson(request, inputSchema);
    const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    await enforceRateLimit(`desktop-authorize-start:${(await sha256Hex(ip)).slice(0, 20)}`, 10, 10 * 60_000);
    const deviceCode = randomCode(48, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_');
    const rawUserCode = randomCode(8, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
    const userCode = `${rawUserCode.slice(0, 4)}-${rawUserCode.slice(4)}`;
    const now = Date.now();
    const expiresAt = now + 10 * 60_000;
    await env.DB.prepare(`INSERT INTO desktop_authorizations
      (id, device_code_hash, user_code_hash, device_name, app_version, status, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`)
      .bind(
        crypto.randomUUID(),
        await sha256Hex(`desktop-device:${deviceCode}`),
        await sha256Hex(`desktop-user:${rawUserCode}`),
        input.deviceName,
        input.appVersion,
        expiresAt,
        now,
      ).run();
    const verificationUrl = new URL('/desktop/connect', request.url);
    verificationUrl.searchParams.set('code', userCode);
    return json({ deviceCode, userCode, verificationUrl: verificationUrl.toString(), expiresAt, intervalSeconds: 2 }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      console.error(JSON.stringify({ level: 'error', event: 'desktop_authorization_start_failed', message: error.message }));
    }
    return handleApiError(error);
  }
}
