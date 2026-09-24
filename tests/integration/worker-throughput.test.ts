import { randomUUID } from "node:crypto";
import { PgBoss } from "pg-boss";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDatabaseUrl } from "../helpers/db";
import { createPgBossDispatchQueue, startDispatchWorker } from "@/modules/dispatch/pgboss-queue";

// Runs the real pg-boss worker against a throwaway schema, so it never touches
// the shared pgboss schema, and measures that dispatches run concurrently.

const HANDLER_MS = 200;
const THROUGHPUT_BUDGET_MS = 3_000;

interface Run {
  start: number;
  end: number;
}

async function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`condition not met within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe("dispatch worker throughput (real pg-boss, isolated schema)", () => {
  const schemaName = `test_pgboss_${randomUUID().replace(/-/g, "_")}`;
  const runs = new Map<string, Run>();
  let boss: PgBoss;
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: testDatabaseUrl() });
    boss = new PgBoss({ connectionString: testDatabaseUrl(), schema: schemaName, useListenNotify: true });
    delete (globalThis as Record<string, unknown>).__metacraftDispatchWorkerStarted;

    await startDispatchWorker(async (dispatchId) => {
      if (dispatchId.startsWith("boom-")) {
        throw new Error("simulated handler failure");
      }
      const start = Date.now();
      await new Promise((resolve) => setTimeout(resolve, HANDLER_MS));
      runs.set(dispatchId, { start, end: Date.now() });
    }, boss);
  });

  afterAll(async () => {
    await boss.stop({ graceful: false });
    delete (globalThis as Record<string, unknown>).__metacraftDispatchWorkerStarted;
    await pool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await pool.end();
  });

  it(`processes 10 jobs of ${HANDLER_MS}ms within ${THROUGHPUT_BUDGET_MS}ms, with handlers overlapping`, async () => {
    const queue = createPgBossDispatchQueue(boss);
    const ids = Array.from({ length: 10 }, () => `ok-${randomUUID()}`);

    const started = Date.now();
    await Promise.all(ids.map((id) => queue.enqueueDispatch(id)));
    await waitFor(() => ids.every((id) => runs.has(id)), 10_000);
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThanOrEqual(THROUGHPUT_BUDGET_MS);

    const intervals = ids.map((id) => runs.get(id) as Run);
    const overlapped = intervals.some((a, i) =>
      intervals.some((b, j) => i !== j && a.start < b.end && b.start < a.end),
    );
    expect(overlapped).toBe(true);
  });

  it("a job whose handler throws does not stop the other jobs", async () => {
    const queue = createPgBossDispatchQueue(boss);
    const okIds = Array.from({ length: 9 }, () => `ok-${randomUUID()}`);

    await Promise.all([queue.enqueueDispatch(`boom-${randomUUID()}`), ...okIds.map((id) => queue.enqueueDispatch(id))]);
    await waitFor(() => okIds.every((id) => runs.has(id)), 10_000);

    expect(okIds.every((id) => runs.has(id))).toBe(true);
  });
});
