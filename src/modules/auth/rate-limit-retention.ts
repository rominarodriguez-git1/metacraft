import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { lt } from "drizzle-orm";
import { authRateLimitHit } from "@/db/schema/rate-limit";
import type * as schema from "@/db/schema";

/**
 * The longest rate-limit window looks back one hour, so older hit rows can
 * never affect a decision again. Keeping a margin on top of that avoids
 * racing a window that is being evaluated right at its edge.
 */
export const RATE_LIMIT_HIT_RETENTION_MS = 2 * 60 * 60 * 1000;

/**
 * Deletes rate-limit hit rows older than the retention period, so the table
 * does not grow without bound. Returns how many rows were removed.
 */
export async function pruneRateLimitHits(
  db: NodePgDatabase<typeof schema>,
  options: { now?: Date; retentionMs?: number } = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - (options.retentionMs ?? RATE_LIMIT_HIT_RETENTION_MS));
  const deleted = await db
    .delete(authRateLimitHit)
    .where(lt(authRateLimitHit.createdAt, cutoff))
    .returning({ id: authRateLimitHit.id });
  return deleted.length;
}
