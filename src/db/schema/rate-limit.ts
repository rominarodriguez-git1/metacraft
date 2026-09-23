import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * One row per magic-link send attempt, scoped by "email" or "ip". Counting
 * rows within a trailing window (instead of a single counter+resetAt pair)
 * lets the per-email short window (60s) and long window (1h) share the same
 * table as the per-IP hourly window without separate bookkeeping.
 */
export const authRateLimitHit = pgTable(
  "auth_rate_limit_hit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("auth_rate_limit_hit_scope_key_created_at_idx").on(table.scope, table.key, table.createdAt)],
);
