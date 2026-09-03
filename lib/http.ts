import type { ZodType } from 'zod';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, 'invalid_json', 'The request body must be valid JSON.');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(422, 'validation_failed', 'The request did not match the API contract.', parsed.error.flatten());
  }
  return parsed.data;
}

export function handleApiError(error: unknown): Response {
  if (error instanceof ApiError) {
    return json({ error: { code: error.code, message: error.message, details: error.details } }, { status: error.status });
  }
  const reference = crypto.randomUUID();
  console.error(JSON.stringify({ level: 'error', event: 'unhandled_api_error', reference, message: error instanceof Error ? error.message : 'Unknown error' }));
  return json({ error: { code: 'internal_error', message: 'The request could not be completed.', reference } }, { status: 500 });
}

export function noStoreHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set('cache-control', 'no-store, private');
  headers.set('x-content-type-options', 'nosniff');
  return headers;
}
