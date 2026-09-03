import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { devices, users } from '@/db/schema';
import { constantTimeEqual, hmacHex } from './crypto';
import { ApiError } from './http';
import { isDesktopAccountPathAllowed } from './desktop-auth-policy';

export type DesktopTokenPayload = {
  version: 1;
  userId: string;
  deviceId: string;
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
};

export type DesktopAccountTokenPayload = {
  version: 2;
  userId: string;
  deviceId: string;
  scope: 'account';
  issuedAt: number;
  expiresAt: number;
};

const tokenPrefix = 'icd_';

function signingSecret(): string {
  const secret = process.env.DESKTOP_TOKEN_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new ApiError(503, 'desktop_auth_not_configured', 'Desktop connection is not configured.');
  }
  return secret;
}

function encodePayload(payload: DesktopTokenPayload | DesktopAccountTokenPayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodePayload(value: string): DesktopTokenPayload | DesktopAccountTokenPayload {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as DesktopTokenPayload | DesktopAccountTokenPayload;
  } catch {
    throw new ApiError(401, 'invalid_desktop_token', 'The desktop connection is invalid.');
  }
}

export async function createDesktopToken(input: Omit<DesktopTokenPayload, 'version' | 'issuedAt' | 'expiresAt'>): Promise<{ token: string; expiresAt: number }> {
  const issuedAt = Date.now();
  const payload: DesktopTokenPayload = { version: 1, ...input, issuedAt, expiresAt: issuedAt + 8 * 60 * 60 * 1_000 };
  const encoded = encodePayload(payload);
  const signature = await hmacHex(signingSecret(), `desktop-token:v1:${encoded}`);
  return { token: `${tokenPrefix}${encoded}.${signature}`, expiresAt: payload.expiresAt };
}

export async function createDesktopAccountToken(input: Pick<DesktopAccountTokenPayload, 'userId' | 'deviceId'>): Promise<{ token: string; expiresAt: number }> {
  const issuedAt = Date.now();
  const payload: DesktopAccountTokenPayload = {
    version: 2,
    ...input,
    scope: 'account',
    issuedAt,
    expiresAt: issuedAt + 30 * 24 * 60 * 60 * 1_000,
  };
  const encoded = encodePayload(payload);
  const signature = await hmacHex(signingSecret(), `desktop-token:v2:${encoded}`);
  return { token: `${tokenPrefix}${encoded}.${signature}`, expiresAt: payload.expiresAt };
}

export async function verifyDesktopToken(token: string, requestUrl: string): Promise<{
  userId: string;
  deviceId: string;
  sessionId?: string;
  subject: string;
  email: string;
  name: string | null;
}> {
  if (!token.startsWith(tokenPrefix)) throw new ApiError(401, 'invalid_desktop_token', 'The desktop connection is invalid.');
  const [encoded, signature, extra] = token.slice(tokenPrefix.length).split('.');
  if (!encoded || !signature || extra) throw new ApiError(401, 'invalid_desktop_token', 'The desktop connection is invalid.');
  const payload = decodePayload(encoded) as DesktopTokenPayload | DesktopAccountTokenPayload;
  const signatureVersion = payload.version === 2 ? 2 : 1;
  const expected = await hmacHex(signingSecret(), `desktop-token:v${signatureVersion}:${encoded}`);
  if (!constantTimeEqual(signature, expected)) throw new ApiError(401, 'invalid_desktop_token', 'The desktop connection is invalid.');
  if (![1, 2].includes(payload.version) || payload.expiresAt <= Date.now()) throw new ApiError(401, 'desktop_token_expired', 'The desktop sign-in expired. Sign in again from the Mac app.');

  const pathname = new URL(requestUrl).pathname;
  if (payload.version === 1) {
    const allowedPrefix = `/api/v1/sessions/${encodeURIComponent(payload.sessionId)}`;
    if (!(pathname === allowedPrefix || pathname.startsWith(`${allowedPrefix}/`))) {
      throw new ApiError(403, 'desktop_scope_denied', 'This desktop connection is limited to its linked interview session.');
    }
  } else if (!isDesktopAccountPathAllowed(pathname)) {
    throw new ApiError(403, 'desktop_scope_denied', 'The Mac app blocked this account action. Complete sensitive account changes on the web.');
  }

  const db = getDb();
  const rows = await db.select({
    deviceId: devices.id,
    userId: users.id,
    email: users.email,
    name: users.displayName,
  }).from(devices)
    .innerJoin(users, eq(devices.userId, users.id))
    .where(and(eq(devices.id, payload.deviceId), eq(devices.userId, payload.userId), isNull(devices.revokedAt)))
    .limit(1);
  if (!rows[0]) throw new ApiError(401, 'desktop_device_revoked', 'This desktop device is no longer authorized.');
  await db.update(devices).set({ lastSeenAt: Date.now() }).where(eq(devices.id, payload.deviceId));
  return {
    userId: rows[0].userId,
    deviceId: rows[0].deviceId,
    sessionId: payload.version === 1 ? payload.sessionId : undefined,
    subject: `desktop:${rows[0].userId}`,
    email: rows[0].email,
    name: rows[0].name,
  };
}
