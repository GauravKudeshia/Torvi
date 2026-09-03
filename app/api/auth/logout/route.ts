export async function GET(request: Request) {
  const issuer = process.env.AUTH0_ISSUER_BASE_URL?.replace(/\/$/, '');
  const clientId = process.env.AUTH0_CLIENT_ID;
  const origin = new URL(request.url).origin;
  const destination = issuer && clientId
    ? `${issuer}/v2/logout?client_id=${encodeURIComponent(clientId)}&returnTo=${encodeURIComponent(origin)}`
    : origin;
  return new Response(null, {
    status: 302,
    headers: {
      location: destination,
      'set-cookie': 'ic_access_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
      'cache-control': 'no-store',
    },
  });
}
