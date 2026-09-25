import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { PgBoss } from "pg-boss";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, testDatabaseUrl, type TestDatabase } from "../helpers/db";
import * as schema from "@/db/schema";
import type { DispatchQueue } from "@/modules/dispatch/queue-port";
import { createPgBossDispatchQueue, DISPATCH_QUEUE_NAME } from "@/modules/dispatch/pgboss-queue";
import { requeueStalePendingDispatches, STALE_PENDING_AFTER_MS } from "@/modules/dispatch/sweeper";
import { clearAdapters, registerAdapter } from "@/modules/providers/registry";
import type { ProviderAdapter } from "@/modules/providers/port";
import type { Provider } from "@/modules/providers/types";
import { insertRequestWithDispatches } from "@/modules/requests/repository";
import { submitQuoteRequest } from "@/modules/requests/submit";

// A dispatch row can outlive its queue job: the process can die between the
// commit and the enqueue, or the enqueue can fail. These tests cover the
// recovery path: submit tolerates a failed enqueue, the sweeper re-enqueues
// stale pending dispatches, and the queue never holds two live jobs for one
// dispatch.

class RecordingQueue implements DispatchQueue {
  readonly enqueued: string[] = [];
  async enqueueDispatch(dispatchId: string): Promise<void> {
    this.enqueued.push(dispatchId);
  }
}

const PROVIDERS: Provider[] = Array.from({ length: 3 }, (_, index) => ({
  id: `recov-${index + 1}`,
  sourceId: "recov",
  name: `Recovery Provider ${index + 1}`,
  trades: ["albanileria"],
  zones: ["Centro"],
  ratingAvg: 4,
  reviewCount: 10,
  isNew: false,
  verified: true,
  jobMinUyu: 10000,
  jobMaxUyu: 120000,
  earliestStartWeeks: 1,
}));

const adapter: ProviderAdapter = {
  sourceId: "recov",
  async search() {
    return PROVIDERS;
  },
  async dispatch() {
    return { status: "sent" as const };
  },
};

function body() {
  return {
    trade: "albanileria",
    areaM2: 40,
    department: "Montevideo",
    zone: "Centro",
    budgetMinUyu: 10000,
    budgetMaxUyu: 60000,
    timeline: "flexible",
    materialsIncluded: false,
    description: "Revoque de fachada",
    contactPhone: "099 111 222",
    providerIds: PROVIDERS.map((provider) => provider.id),
  };
}

describe("dispatch recovery", () => {
  let testDb: TestDatabase;
  let userId: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
  });

  afterAll(async () => {
    await testDb.close();
  });

  beforeEach(async () => {
    userId = randomUUID();
    await testDb.db.insert(schema.user).values({
      id: userId,
      name: "Recovery User",
      email: `${userId}@example.com`,
      emailVerified: true,
    });
    registerAdapter(adapter);
  });

  afterEach(async () => {
    clearAdapters();
    await testDb.truncateAll();
  });

  async function seedDispatches(count: number): Promise<string[]> {
    const ids = PROVIDERS.slice(0, count).map((provider) => provider.id);
    const created = await insertRequestWithDispatches(testDb.db, {
      userId,
      idempotencyKey: randomUUID(),
      payloadHash: randomUUID(),
      trade: "albanileria",
      areaM2: 40,
      department: "Montevideo",
      zone: "Centro",
      budgetMinUyu: 10000,
      budgetMaxUyu: 60000,
      timeline: "flexible",
      materialsIncluded: false,
      description: "Revoque de fachada",
      contactPhone: "099111222",
      providerIds: ids,
      dispatchSourceIds: Object.fromEntries(ids.map((id) => [id, "recov"])),
    });
    return created.dispatches.map((dispatch) => dispatch.id);
  }

  async function ageDispatch(id: string, msAgo: number): Promise<void> {
    await testDb.db
      .update(schema.dispatch)
      .set({ createdAt: sql`now() - make_interval(secs => ${msAgo / 1000})` })
      .where(eq(schema.dispatch.id, id));
  }

  it("submit still returns created and keeps the rows when every enqueue fails", async () => {
    const failingQueue: DispatchQueue = {
      async enqueueDispatch() {
        throw new Error("queue unavailable");
      },
    };

    const result = await submitQuoteRequest(
      testDb.db,
      { userId, idempotencyKey: randomUUID(), body: body() },
      { dispatchQueue: failingQueue },
    );

    expect(result.outcome).toBe("created");
    const rows = await testDb.db.select().from(schema.dispatch);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.status === "pending")).toBe(true);
  });

  it("the sweeper re-enqueues only pending dispatches older than the stale threshold", async () => {
    const [stale, fresh, sentOld] = await seedDispatches(3);
    await ageDispatch(stale as string, STALE_PENDING_AFTER_MS * 2);
    await ageDispatch(sentOld as string, STALE_PENDING_AFTER_MS * 2);
    await testDb.db.update(schema.dispatch).set({ status: "sent" }).where(eq(schema.dispatch.id, sentOld as string));

    const queue = new RecordingQueue();
    const requeued = await requeueStalePendingDispatches(testDb.db, queue);

    expect(requeued).toBe(1);
    expect(queue.enqueued).toEqual([stale]);
    expect(queue.enqueued).not.toContain(fresh);
  });

  it("a failed enqueue during a sweep does not stop the other stale dispatches", async () => {
    const ids = await seedDispatches(3);
    for (const id of ids) {
      await ageDispatch(id, STALE_PENDING_AFTER_MS * 2);
    }
    const attempted: string[] = [];
    const flakyQueue: DispatchQueue = {
      async enqueueDispatch(dispatchId) {
        attempted.push(dispatchId);
        if (dispatchId === ids[0]) {
          throw new Error("transient");
        }
      },
    };

    const requeued = await requeueStalePendingDispatches(testDb.db, flakyQueue);

    expect(attempted.sort()).toEqual([...ids].sort());
    expect(requeued).toBe(2);
  });
});

describe("dispatch queue deduplication (real pg-boss, isolated schema)", () => {
  const schemaName = `test_pgboss_${randomUUID().replace(/-/g, "_")}`;
  let boss: PgBoss;
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: testDatabaseUrl() });
    boss = new PgBoss({ connectionString: testDatabaseUrl(), schema: schemaName });
  });

  afterAll(async () => {
    await boss.stop({ graceful: false });
    await pool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await pool.end();
  });

  it("enqueueing the same dispatch twice leaves exactly one live job", async () => {
    const queue = createPgBossDispatchQueue(boss);
    const dispatchId = randomUUID();

    await queue.enqueueDispatch(dispatchId);
    await queue.enqueueDispatch(dispatchId);

    const { rows } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "${schemaName}".job WHERE name = $1 AND data->>'dispatchId' = $2 AND state IN ('created', 'retry', 'active')`,
      [DISPATCH_QUEUE_NAME, dispatchId],
    );
    expect(rows[0]?.n).toBe(1);
  });
});
