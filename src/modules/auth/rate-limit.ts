import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, count, eq, gt, sql } from "drizzle-orm";
import { authRateLimitHit } from "@/db/schema/rate-limit";
import type * as schema from "@/db/schema";

const PER_EMAIL_SHORT_WINDOW_SECONDS = 60;
const PER_EMAIL_SHORT_WINDOW_MAX = 1;
const PER_EMAIL_HOUR_WINDOW_SECONDS = 60 * 60;
const PER_EMAIL_HOUR_WINDOW_MAX = 5;
const PER_IP_HOUR_WINDOW_SECONDS = 60 * 60;
const PER_IP_HOUR_WINDOW_MAX = 20;

const EMAIL_SCOPE = "email";
const IP_SCOPE = "ip";

export class RateLimitExceededError extends Error {
  constructor() {
    super("Rate limit exceeded");
    this.name = "RateLimitExceededError";
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Satisfied by both the database and a transaction handle.
type HitCounter = Pick<NodePgDatabase<typeof schema>, "select">;

async function countHits(
  db: HitCounter,
  scope: string,
  key: string,
  since: Date,
): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(authRateLimitHit)
    .where(and(eq(authRateLimitHit.scope, scope), eq(authRateLimitHit.key, key), gt(authRateLimitHit.createdAt, since)));
  return rows[0]?.value ?? 0;
}

/**
 * Enforces a per-email limit (1/60s, 5/hour) and a per-IP limit (20/hour)
 * ahead of a magic-link send, throwing RateLimitExceededError when either is
 * breached. Windows are computed from the application clock (not the
 * database's `now()`) and hit rows are stamped with that same instant, so
 * the limiter can be exercised under `vi.setSystemTime` in tests.
 */
export async function enforceMagicLinkRateLimit(
  db: NodePgDatabase<typeof schema>,
  params: { email: string; ip: string },
): Promise<void> {
  const email = normalizeEmail(params.email);
  const { ip } = params;
  const now = new Date();

  // Count-then-insert must be atomic per key, or two concurrent sends for the
  // same email both read 0 and both pass a 1-per-minute window. Transaction-
  // scoped advisory locks serialize same-key callers; they are taken in a
  // fixed (sorted) order so two callers can never deadlock.
  const lockKeys = [`${EMAIL_SCOPE}:${email}`, `${IP_SCOPE}:${ip}`].sort();

  await db.transaction(async (tx) => {
    for (const lockKey of lockKeys) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
    }

    const [emailShort, emailHour, ipHour] = await Promise.all([
      countHits(tx, EMAIL_SCOPE, email, new Date(now.getTime() - PER_EMAIL_SHORT_WINDOW_SECONDS * 1000)),
      countHits(tx, EMAIL_SCOPE, email, new Date(now.getTime() - PER_EMAIL_HOUR_WINDOW_SECONDS * 1000)),
      countHits(tx, IP_SCOPE, ip, new Date(now.getTime() - PER_IP_HOUR_WINDOW_SECONDS * 1000)),
    ]);

    if (
      emailShort >= PER_EMAIL_SHORT_WINDOW_MAX ||
      emailHour >= PER_EMAIL_HOUR_WINDOW_MAX ||
      ipHour >= PER_IP_HOUR_WINDOW_MAX
    ) {
      throw new RateLimitExceededError();
    }

    await tx.insert(authRateLimitHit).values([
      { scope: EMAIL_SCOPE, key: email, createdAt: now },
      { scope: IP_SCOPE, key: ip, createdAt: now },
    ]);
  });
}
