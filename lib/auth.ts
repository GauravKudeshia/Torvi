import { createRemoteJWKSet, jwtVerify } from 'jose';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { entitlements, profiles, users } from '@/db/schema';
import { ApiError } from './http';
import { verifyDesktopToken } from './desktop-auth';
import { ensureRuntimeSchema } from '@/db/runtime-schema';

export type Actor = {
  subject: string;
  email: string;
  name: string | null;
  userId: string;
  deviceId?: string;
  desktopSessionId?: string;
};

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function bearer(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7);
  const cookie = request.headers.get('cookie') ?? '';
  const token = cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith('ic_access_token='));
  return token ? decodeURIComponent(token.slice('ic_access_token='.length)) : null;
}

async function verifyAuth0(token: string): Promise<Omit<Actor, 'userId'>> {
  const issuer = process.env.AUTH0_ISSUER_BASE_URL?.replace(/\/$/, '');
  const audience = process.env.AUTH0_AUDIENCE;
  if (!issuer || !audience) throw new ApiError(503, 'auth_not_configured', 'Authentication is not configured.');
  jwks ??= createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  const { payload } = await jwtVerify(token, jwks, { issuer: `${issuer}/`, audience });
  if (!payload.sub) throw new ApiError(401, 'invalid_token', 'The access token has no subject.');
  return {
    subject: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : `${payload.sub}@private.invalid`,
    name: typeof payload.name === 'string' ? payload.name : null,
  };
}

async function ensureUser(identity: Omit<Actor, 'userId'>): Promise<Actor> {
  const db = getDb();
  const found = await db.select({ id: users.id }).from(users).where(eq(users.authSubject, identity.subject)).limit(1);
  if (found[0]) return { ...identity, userId: found[0].id };

  const now = Date.now();
  const userId = crypto.randomUUID();
  await db.batch([
    db.insert(users).values({
      id: userId,
      authSubject: identity.subject,
      email: identity.email,
      displayName: identity.name,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing(),
    // A concurrent first request may win the unique auth_subject insert.
    // Resolve the canonical ID inside this transaction, never use the losing UUID.
    db.insert(profiles).values({ userId: sql`(SELECT id FROM users WHERE auth_subject = ${identity.subject})`, updatedAt: now }).onConflictDoNothing(),
    db.insert(entitlements).values({ userId: sql`(SELECT id FROM users WHERE auth_subject = ${identity.subject})`, updatedAt: now }).onConflictDoNothing(),
  ]);
  const created = await db.select({ id: users.id }).from(users).where(eq(users.authSubject, identity.subject)).limit(1);
  if (!created[0]) throw new ApiError(500, 'user_provision_failed', 'The account could not be provisioned.');
  return { ...identity, userId: created[0].id };
}

export async function requireActor(request: Request): Promise<Actor> {
  await ensureRuntimeSchema();
  const sitesUserId = request.headers.get('oai-authenticated-user-id');
  const sitesEmail = request.headers.get('oai-authenticated-user-email');
  if (sitesUserId && sitesEmail) {
    const encodedName = request.headers.get('oai-authenticated-user-full-name');
    const name = encodedName && request.headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8'
      ? decodeURIComponent(encodedName)
      : null;
    return ensureUser({ subject: `sites:${sitesUserId}`, email: sitesEmail, name });
  }

  const token = bearer(request);
  if (token) {
    try {
      if (token.startsWith('icd_')) {
        const desktop = await verifyDesktopToken(token, request.url);
        return {
          subject: desktop.subject,
          email: desktop.email,
          name: desktop.name,
          userId: desktop.userId,
          deviceId: desktop.deviceId,
          desktopSessionId: desktop.sessionId,
        };
      }
      return await ensureUser(await verifyAuth0(token));
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(401, 'invalid_token', 'The access token is invalid or expired.');
    }
  }

  const demoAllowed = process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEMO_AUTH !== '0';
  if (demoAllowed) {
    return ensureUser({
      subject: request.headers.get('x-demo-user') ?? 'local-demo-user',
      email: 'demo@interviewcopilot.local',
      name: 'Demo Candidate',
    });
  }
  throw new ApiError(401, 'authentication_required', 'Sign in to continue.');
}
