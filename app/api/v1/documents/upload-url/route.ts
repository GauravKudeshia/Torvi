import { z } from 'zod';
import { getDb } from '@/db';
import { documents, uploadTickets } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { hmacHex } from '@/lib/crypto';
import { ApiError, handleApiError, json, parseJson } from '@/lib/http';

const uploadSchema = z.object({
  fileName: z.string().trim().min(1).max(240),
  contentType: z.enum(['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']),
  sizeBytes: z.number().int().positive().max(8 * 1024 * 1024),
  kind: z.enum(['resume', 'job-description', 'other']),
});

function signingSecret(): string {
  const secret = process.env.UPLOAD_SIGNING_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== 'production') return 'local-development-upload-secret';
  throw new ApiError(503, 'uploads_not_configured', 'Secure uploads are not configured.');
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    const input = await parseJson(request, uploadSchema);
    const documentId = crypto.randomUUID();
    const ticketId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + 10 * 60 * 1000;
    const objectKey = `users/${actor.userId}/documents/${documentId}`;
    await getDb().batch([
      getDb().insert(documents).values({
        id: documentId,
        userId: actor.userId,
        kind: input.kind,
        fileName: input.fileName,
        contentType: input.contentType,
        objectKey,
        sizeBytes: input.sizeBytes,
        sha256: '',
        parseStatus: 'uploading',
        createdAt: now,
        updatedAt: now,
      }),
      getDb().insert(uploadTickets).values({ id: ticketId, userId: actor.userId, documentId, objectKey, expiresAt }),
    ]);
    const signature = await hmacHex(signingSecret(), `${ticketId}:${expiresAt}`);
    const url = new URL('/api/v1/documents/upload', request.url);
    url.searchParams.set('ticket', ticketId);
    url.searchParams.set('expires', String(expiresAt));
    url.searchParams.set('signature', signature);
    return json({ documentId, uploadUrl: url.toString(), method: 'PUT', expiresAt });
  } catch (error) {
    return handleApiError(error);
  }
}
