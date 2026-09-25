import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, type TestDatabase } from "../helpers/db";
import { clearAdapters, registerAdapter } from "@/modules/providers/registry";
import type { ProviderAdapter } from "@/modules/providers/port";
import type { Provider } from "@/modules/providers/types";
import type { DispatchQueue } from "@/modules/dispatch/queue-port";
import * as schema from "@/db/schema";

/**
 * Records every enqueued dispatch id in memory instead of touching pg-boss,
 * so this suite never writes jobs into the shared pgboss schema.
 */
class RecordingDispatchQueue implements DispatchQueue {
  readonly enqueued: string[] = [];

  async enqueueDispatch(dispatchId: string): Promise<void> {
    this.enqueued.push(dispatchId);
  }
}

const sessionHolder: { current: { userId: string } | null } = { current: null };

vi.mock("@/modules/auth/session", () => ({
  requireSession: vi.fn(async (options?: { api?: boolean }) => {
    if (sessionHolder.current) {
      return { user: { id: sessionHolder.current.userId, email: `${sessionHolder.current.userId}@example.com` } };
    }
    if (options?.api) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error("no session");
  }),
}));

const dbHolder: { current?: TestDatabase["db"] } = {};
vi.mock("@/db/client", () => ({
  get db() {
    return dbHolder.current;
  },
}));

const TEST_PROVIDERS: Provider[] = Array.from({ length: 3 }, (_, index) => ({
  id: `testsrc-${index + 1}`,
  sourceId: "testsrc",
  name: `Test Provider ${index + 1}`,
  trades: ["albanileria"],
  zones: ["Centro"],
  ratingAvg: 4.2,
  reviewCount: 20,
  isNew: false,
  verified: true,
  jobMinUyu: 10000,
  jobMaxUyu: 120000,
  earliestStartWeeks: 1,
}));

const testAdapter: ProviderAdapter = {
  sourceId: "testsrc",
  async search(): Promise<Provider[]> {
    return TEST_PROVIDERS;
  },
  async dispatch(): Promise<{ status: "sent" }> {
    return { status: "sent" };
  },
};

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    trade: "albanileria",
    areaM2: 80,
    department: "Montevideo",
    zone: "Centro",
    budgetMinUyu: 10000,
    budgetMaxUyu: 50000,
    timeline: "flexible",
    materialsIncluded: true,
    description: "Renovar cocina completa",
    contactPhone: "+598 99 123 456",
    providerIds: ["testsrc-1", "testsrc-2", "testsrc-3"],
    ...overrides,
  };
}

describe("requests authorization (AC2)", () => {
  let testDb: TestDatabase;
  let POST: typeof import("@/app/api/requests/route").POST;
  let GET: typeof import("@/app/api/requests/[id]/route").GET;
  let userA: string;
  let userB: string;
  let userARequestId: string;
  let dispatchQueue: RecordingDispatchQueue;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    dbHolder.current = testDb.db;
    const { createRequestsPostHandler } = await import("@/app/api/requests/route");
    dispatchQueue = new RecordingDispatchQueue();
    POST = createRequestsPostHandler(dispatchQueue);
    ({ GET } = await import("@/app/api/requests/[id]/route"));
  });

  afterAll(async () => {
    await testDb.close();
  });

  beforeEach(async () => {
    userA = randomUUID();
    userB = randomUUID();
    await testDb.db.insert(schema.user).values([
      { id: userA, name: "User A", email: `${userA}@example.com`, emailVerified: true },
      { id: userB, name: "User B", email: `${userB}@example.com`, emailVerified: true },
    ]);
    registerAdapter(testAdapter);
    dispatchQueue.enqueued.length = 0;

    sessionHolder.current = { userId: userA };
    const response = await post(validBody());
    const created = await response.json();
    userARequestId = created.id;
  });

  afterEach(async () => {
    clearAdapters();
    sessionHolder.current = null;
    await testDb.truncateAll();
  });

  function post(body: unknown, idempotencyKey: string = randomUUID()) {
    return POST(
      new Request("http://localhost/api/requests", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify(body),
      }),
    );
  }

  function get(id: string) {
    return GET(new Request(`http://localhost/api/requests/${id}`), { params: Promise.resolve({ id }) });
  }

  it("returns 401 for GET without a session", async () => {
    sessionHolder.current = null;
    const response = await get(userARequestId);
    expect(response.status).toBe(401);
  });

  it("returns 401 for POST (mutation) without a session", async () => {
    sessionHolder.current = null;
    const response = await post(validBody());
    expect(response.status).toBe(401);
  });

  it("returns 404 when user B reads user A's request", async () => {
    sessionHolder.current = { userId: userB };
    const response = await get(userARequestId);
    expect(response.status).toBe(404);
  });

  it("returns 404 for a nonexistent request id", async () => {
    sessionHolder.current = { userId: userA };
    const response = await get(randomUUID());
    expect(response.status).toBe(404);
  });

  it("lets user A read their own request", async () => {
    sessionHolder.current = { userId: userA };
    const response = await get(userARequestId);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.id).toBe(userARequestId);
    expect(dispatchQueue.enqueued).toHaveLength(json.dispatches.length);
    expect(new Set(dispatchQueue.enqueued)).toEqual(
      new Set(json.dispatches.map((dispatch: { id: string }) => dispatch.id)),
    );
  });
});
