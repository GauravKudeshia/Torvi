import { env } from 'cloudflare:workers';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { documents, uploadTickets, users } from '@/db/schema';
import { constantTimeEqual, hmacHex, sha256Hex } from '@/lib/crypto';
import { extractDocument } from '@/lib/documents';
import { ApiError, handleApiError, json } from '@/lib/http';
import { persistProposedDocumentMemory } from '@/lib/professional-memory';

function signingSecret(): string {
  const secret = process.env.UPLOAD_SIGNING_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== 'production') return 'local-development-upload-secret';
  throw new ApiError(503, 'uploads_not_configured', 'Secure uploads are not configured.');
}

export async function PUT(request: Request) {
  try {
    const url = new URL(request.url);
    const ticketId = url.searchParams.get('ticket') ?? '';
    const expires = Number(url.searchParams.get('expires'));
    const signature = url.searchParams.get('signature') ?? '';
    if (!ticketId || !Number.isFinite(expires) || expires < Date.now()) throw new ApiError(401, 'upload_ticket_expired', 'The upload URL has expired.');
    const expected = await hmacHex(signingSecret(), `${ticketId}:${expires}`);
    if (!constantTimeEqual(signature, expected)) throw new ApiError(401, 'invalid_upload_signature', 'The upload signature is invalid.');
    const db = getDb();
    const tickets = await db.select().from(uploadTickets).where(and(eq(uploadTickets.id, ticketId), isNull(uploadTickets.consumedAt))).limit(1);
    const ticket = tickets[0];
    if (!ticket || ticket.expiresAt !== expires || ticket.expiresAt < Date.now()) throw new ApiError(401, 'upload_ticket_expired', 'The upload URL has expired.');
    const docs = await db.select().from(documents).where(eq(documents.id, ticket.documentId)).limit(1);
    const document = docs[0];
    if (!document) throw new ApiError(404, 'document_not_found', 'Document not found.');
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength !== document.sizeBytes) throw new ApiError(422, 'size_mismatch', 'The uploaded file size does not match the signed request.');
    const bytes = new Uint8Array(buffer);
    await env.FILES.put(document.objectKey, buffer, {
      httpMetadata: { contentType: document.contentType },
      customMetadata: { documentId: document.id, kind: document.kind },
    });
    const identity = await db.select({ subject: users.authSubject }).from(users).where(eq(users.id, document.userId)).limit(1);
    try {
      const kind = document.kind as 'resume' | 'job-description' | 'other';
      const extracted = await extractDocument(bytes, document.fileName, document.contentType, identity[0]?.subject ?? document.userId, kind);
      const parseStatus = kind === 'resume' ? 'needs-verification' : 'ready';
      await db.batch([
        db.update(documents).set({
          sha256: await sha256Hex(buffer),
          parseStatus,
          extractedText: extracted.text,
          verifiedFactsJson: JSON.stringify(kind === 'resume' ? extracted.facts : []),
          updatedAt: Date.now(),
        }).where(eq(documents.id, document.id)),
        db.update(uploadTickets).set({ consumedAt: Date.now() }).where(eq(uploadTickets.id, ticket.id)),
      ]);
      const experienceIds = await persistProposedDocumentMemory({
        userId: document.userId,
        documentId: document.id,
        fileName: document.fileName,
        documentKind: kind,
        summary: extracted.summary,
        facts: extracted.facts,
      });
      return json({
        documentId: document.id,
        parseStatus,
        candidateFacts: kind === 'resume' ? extracted.facts : [],
        summary: extracted.summary,
        proposedExperienceIds: experienceIds,
      });
    } catch (error) {
      await db.batch([
        db.update(documents).set({ sha256: await sha256Hex(buffer), parseStatus: 'parse-failed', updatedAt: Date.now() }).where(eq(documents.id, document.id)),
        db.update(uploadTickets).set({ consumedAt: Date.now() }).where(eq(uploadTickets.id, ticket.id)),
      ]);
      throw error;
    }
  } catch (error) {
    return handleApiError(error);
  }
}
