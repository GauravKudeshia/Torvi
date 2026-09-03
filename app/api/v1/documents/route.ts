import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { documents } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { handleApiError, json } from '@/lib/http';

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    const rows = await getDb().select({
      id: documents.id,
      kind: documents.kind,
      fileName: documents.fileName,
      contentType: documents.contentType,
      sizeBytes: documents.sizeBytes,
      parseStatus: documents.parseStatus,
      verifiedFactsJson: documents.verifiedFactsJson,
      createdAt: documents.createdAt,
    }).from(documents).where(eq(documents.userId, actor.userId)).orderBy(desc(documents.createdAt));
    return json({ documents: rows.map((row) => ({ ...row, candidateFacts: JSON.parse(row.verifiedFactsJson), verifiedFactsJson: undefined })) });
  } catch (error) {
    return handleApiError(error);
  }
}
