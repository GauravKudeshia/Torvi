import { sha256Hex } from '@/lib/crypto';

function base64url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const requestedReturnTo = requestUrl.searchParams.get('returnTo') ?? '/dashboard';
  const returnTo = requestedReturnTo.startsWith('/') && !requestedReturnTo.startsWith('//') ? requestedReturnTo : '/dashboard';
  const issuer = process.env.AUTH0_ISSUER_BASE_URL?.replace(/\/$/, '');
  const clientId = process.env.AUTH0_CLIENT_ID;
  const audience = process.env.AUTH0_AUDIENCE;
  if (!issuer || !clientId || !audience) {
    if (process.env.NODE_ENV !== 'production') return Response.redirect(new URL('/dashboard', request.url));
    return new Response('Authentication is not configured.', { status: 503 });
  }
  const random = crypto.getRandomValues(new Uint8Array(48));
  const verifier = base64url(random);
  const challengeBytes = new Uint8Array((await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const challenge = base64url(challengeBytes);
  const state = (await sha256Hex(crypto.randomUUID())).slice(0, 40);
  const callback = new URL('/api/auth/callback', request.url).toString();
  const authorize = new URL(`${issuer}/authorize`);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', callback);
  authorize.searchParams.set('scope', 'openid profile email');
  authorize.searchParams.set('audience', audience);
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('code_challenge', challenge);
  authorize.searchParams.set('code_challenge_method', 'S256');
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  const headers = new Headers({ location: authorize.toString() });
  headers.append('set-cookie', `ic_oauth_state=${state}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
  headers.append('set-cookie', `ic_pkce_verifier=${verifier}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
  headers.append('set-cookie', `ic_auth_return_to=${encodeURIComponent(returnTo)}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
  return new Response(null, {
    status: 302,
    headers,
  });
}
