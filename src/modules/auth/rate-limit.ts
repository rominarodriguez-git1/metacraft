import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, count, eq, gt } from "drizzle-orm";
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

async function countHits(
  db: NodePgDatabase<typeof schema>,
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

  const [emailShort, emailHour, ipHour] = await Promise.all([
    countHits(db, EMAIL_SCOPE, email, new Date(now.getTime() - PER_EMAIL_SHORT_WINDOW_SECONDS * 1000)),
    countHits(db, EMAIL_SCOPE, email, new Date(now.getTime() - PER_EMAIL_HOUR_WINDOW_SECONDS * 1000)),
    countHits(db, IP_SCOPE, ip, new Date(now.getTime() - PER_IP_HOUR_WINDOW_SECONDS * 1000)),
  ]);

  if (
    emailShort >= PER_EMAIL_SHORT_WINDOW_MAX ||
    emailHour >= PER_EMAIL_HOUR_WINDOW_MAX ||
    ipHour >= PER_IP_HOUR_WINDOW_MAX
  ) {
    throw new RateLimitExceededError();
  }

  await db.insert(authRateLimitHit).values([
    { scope: EMAIL_SCOPE, key: email, createdAt: now },
    { scope: IP_SCOPE, key: ip, createdAt: now },
  ]);
}
