import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../helpers/db";
import { authRateLimitHit } from "@/db/schema/rate-limit";
import { pruneRateLimitHits, RATE_LIMIT_HIT_RETENTION_MS } from "@/modules/auth/rate-limit-retention";

describe("rate-limit hit retention", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
  });

  afterAll(async () => {
    await testDb.close();
  });

  afterEach(async () => {
    await testDb.truncateAll();
  });

  it("deletes only rows older than the retention period", async () => {
    const now = new Date();
    await testDb.db.insert(authRateLimitHit).values([
      { scope: "email", key: "old@example.com", createdAt: new Date(now.getTime() - RATE_LIMIT_HIT_RETENTION_MS - 60_000) },
      { scope: "ip", key: "203.0.113.9", createdAt: new Date(now.getTime() - RATE_LIMIT_HIT_RETENTION_MS - 1_000) },
      { scope: "email", key: "recent@example.com", createdAt: new Date(now.getTime() - 60_000) },
    ]);

    const removed = await pruneRateLimitHits(testDb.db, { now });

    expect(removed).toBe(2);
    const remaining = await testDb.db.select().from(authRateLimitHit);
    expect(remaining.map((row) => row.key)).toEqual(["recent@example.com"]);
  });

  it("keeps every row the one-hour limit windows still depend on", async () => {
    const now = new Date();
    await testDb.db
      .insert(authRateLimitHit)
      .values({ scope: "email", key: "window@example.com", createdAt: new Date(now.getTime() - 59 * 60 * 1000) });

    const removed = await pruneRateLimitHits(testDb.db, { now });

    expect(removed).toBe(0);
    expect(RATE_LIMIT_HIT_RETENTION_MS).toBeGreaterThan(60 * 60 * 1000);
  });
});
