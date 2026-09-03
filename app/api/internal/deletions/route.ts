import { env } from 'cloudflare:workers';
import { and, eq, lte } from 'drizzle-orm';
import { getDb } from '@/db';
import { deletionRequests, users } from '@/db/schema';
import { ApiError, handleApiError, json } from '@/lib/http';

export async function POST(request: Request) {
  try {
    const secret = process.env.DELETION_CRON_SECRET;
    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) throw new ApiError(401, 'unauthorized', 'Unauthorized.');
    const db = getDb();
    const due = await db.select().from(deletionRequests)
      .where(and(eq(deletionRequests.status, 'scheduled'), lte(deletionRequests.executeAfter, Date.now()))).limit(20);
    for (const item of due) {
      let cursor: string | undefined;
      do {
        const listed = await env.FILES.list({ prefix: `users/${item.userId}/`, cursor });
        if (listed.objects.length) await env.FILES.delete(listed.objects.map((object) => object.key));
        cursor = listed.truncated ? listed.cursor : undefined;
      } while (cursor);
      await db.delete(users).where(eq(users.id, item.userId));
    }
    return json({ deletedAccounts: due.length });
  } catch (error) {
    return handleApiError(error);
  }
}
