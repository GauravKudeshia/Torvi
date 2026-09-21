/** Same-origin JSON requests with honest failures and bounded waiting. */
export async function clientApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const timeout = AbortSignal.timeout(30_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(path, { ...options, signal });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error(timeout.aborted ? 'This is taking too long. Please try again.' : 'Could not connect. Check your connection and try again.');
  }
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!response.ok) {
    throw new Error(response.status === 401 ? 'Your session has expired. Sign in again to continue.' : payload?.error?.message || `The request failed (${response.status}). Please try again.`);
  }
  if (payload === null) throw new Error('The server returned an unreadable response. Please try again.');
  return payload as T;
}
