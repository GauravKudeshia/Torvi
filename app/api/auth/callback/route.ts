function cookies(request: Request): Record<string, string> {
  return Object.fromEntries((request.headers.get('cookie') ?? '').split(';').map((item) => item.trim().split('=').map(decodeURIComponent) as [string, string]).filter(([key]) => key));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const values = cookies(request);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state || state !== values.ic_oauth_state || !values.ic_pkce_verifier) {
    return Response.redirect(new URL('/?auth=failed', request.url));
  }
  const issuer = process.env.AUTH0_ISSUER_BASE_URL?.replace(/\/$/, '');
  const clientId = process.env.AUTH0_CLIENT_ID;
  if (!issuer || !clientId) return new Response('Authentication is not configured.', { status: 503 });
  const callback = new URL('/api/auth/callback', request.url).toString();
  const response = await fetch(`${issuer}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: clientId,
      code_verifier: values.ic_pkce_verifier,
      code,
      redirect_uri: callback,
    }),
  });
  const payload = await response.json() as { access_token?: string; expires_in?: number };
  if (!response.ok || !payload.access_token) return Response.redirect(new URL('/?auth=failed', request.url));
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  const requestedReturnTo = values.ic_auth_return_to ?? '/dashboard';
  const returnTo = requestedReturnTo.startsWith('/') && !requestedReturnTo.startsWith('//') ? requestedReturnTo : '/dashboard';
  const headers = new Headers({ location: new URL(returnTo, request.url).toString(), 'cache-control': 'no-store' });
  headers.append('set-cookie', `ic_access_token=${encodeURIComponent(payload.access_token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.min(payload.expires_in ?? 3600, 86400)}${secure}`);
  headers.append('set-cookie', `ic_auth_return_to=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  return new Response(null, {
    status: 302,
    headers,
  });
}
