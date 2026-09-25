import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, type TestDatabase } from "../helpers/db";
import { clearAdapters, registerAdapter } from "@/modules/providers/registry";
import type { ProviderAdapter } from "@/modules/providers/port";
import type { Provider } from "@/modules/providers/types";
import type { DispatchQueue } from "@/modules/dispatch/queue-port";
import * as repository from "@/modules/requests/repository";
import * as schema from "@/db/schema";

/**
 * Records every enqueued dispatch id in memory instead of touching pg-boss,
 * so this suite never writes jobs into the shared pgboss schema (the leak
 * that produced 386 leftover rows there before this was injected).
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

const TEST_PROVIDERS: Provider[] = Array.from({ length: 5 }, (_, index) => ({
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

describe("POST/GET /api/requests", () => {
  let testDb: TestDatabase;
  let POST: typeof import("@/app/api/requests/route").POST;
  let GET: typeof import("@/app/api/requests/[id]/route").GET;
  let userId: string;
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
    userId = randomUUID();
    await testDb.db.insert(schema.user).values({
      id: userId,
      name: "Test User",
      email: `${userId}@example.com`,
      emailVerified: true,
    });
    sessionHolder.current = { userId };
    registerAdapter(testAdapter);
    dispatchQueue.enqueued.length = 0;
  });

  afterEach(async () => {
    clearAdapters();
    sessionHolder.current = null;
    await testDb.truncateAll();
  });

  function post(body: unknown, idempotencyKey: string | null = randomUUID()) {
    return POST(
      new Request("http://localhost/api/requests", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
        },
        body: JSON.stringify(body),
      }),
    );
  }

  function get(id: string) {
    return GET(new Request(`http://localhost/api/requests/${id}`), { params: Promise.resolve({ id }) });
  }

  async function countRows(): Promise<{ requests: number; dispatches: number }> {
    const requests = await testDb.db.select().from(schema.request);
    const dispatches = await testDb.db.select().from(schema.dispatch);
    return { requests: requests.length, dispatches: dispatches.length };
  }

  describe("validation (AC4)", () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ["missing required field", { description: undefined }],
      ["area <= 0", { areaM2: 0 }],
      ["budget min > max", { budgetMinUyu: 60000, budgetMaxUyu: 50000 }],
      ["unknown trade", { trade: "carpinteria" }],
      ["unknown zone", { zone: "Not A Real Zone" }],
      ["provider count below 2", { providerIds: ["testsrc-1"] }],
      ["provider count above 5", { providerIds: ["testsrc-1", "testsrc-2", "testsrc-3", "testsrc-4", "testsrc-5", "testsrc-6"] }],
      // Bounds: storage is integer columns and free text must not be unbounded.
      ["fractional area (integer column)", { areaM2: 20.5 }],
      ["area above the maximum", { areaM2: 100_001 }],
      ["budget above the maximum", { budgetMinUyu: 0, budgetMaxUyu: 1_000_000_001 }],
      ["fractional budget", { budgetMinUyu: 10000.5 }],
      ["description longer than 2000 characters", { description: "a".repeat(2001) }],
      ["contact phone longer than 32 characters", { contactPhone: "1".repeat(33) }],
      ["zone longer than 64 characters", { zone: "z".repeat(65) }],
      ["provider id longer than 128 characters", { providerIds: ["testsrc-1", "p".repeat(129)] }],
    ];

    for (const [label, overrides] of cases) {
      it(`rejects ${label} with a 422 and a field-level error, without calling the repository`, async () => {
        const insertSpy = vi.spyOn(repository, "insertRequestWithDispatches");

        const response = await post(validBody(overrides));

        expect(response.status).toBe(422);
        const json = await response.json();
        expect(json.error).toBe("ValidationError");
        expect(Object.keys(json.fieldErrors).length).toBeGreaterThan(0);
        expect(insertSpy).not.toHaveBeenCalled();

        const { requests, dispatches } = await countRows();
        expect(requests).toBe(0);
        expect(dispatches).toBe(0);

        insertSpy.mockRestore();
      });
    }
  });

  it("persists every form field and one pending dispatch per provider in a single transaction (AC5 round-trip)", async () => {
    const body = validBody();

    const response = await post(body);
    expect(response.status).toBe(201);
    const created = await response.json();

    expect(created.trade).toBe("albanileria");
    expect(created.areaM2).toBe(80);
    expect(created.department).toBe("Montevideo");
    expect(created.zone).toBe("Centro");
    expect(created.budgetMinUyu).toBe(10000);
    expect(created.budgetMaxUyu).toBe(50000);
    expect(created.timeline).toBe("flexible");
    expect(created.materialsIncluded).toBe(true);
    expect(created.description).toBe("Renovar cocina completa");
    expect(created.contactPhone).toBe("+59899123456");
    expect(created.providerIds).toEqual(["testsrc-1", "testsrc-2", "testsrc-3"]);
    expect(created.dispatches).toHaveLength(3);
    for (const dispatch of created.dispatches) {
      expect(dispatch.status).toBe("pending");
      expect(dispatch.sourceId).toBe("testsrc");
    }

    const readBack = await get(created.id);
    expect(readBack.status).toBe(200);
    const readBackJson = await readBack.json();
    expect(readBackJson).toEqual(created);

    const { requests, dispatches } = await countRows();
    expect(requests).toBe(1);
    expect(dispatches).toBe(3);

    expect(dispatchQueue.enqueued).toHaveLength(created.dispatches.length);
    expect(new Set(dispatchQueue.enqueued)).toEqual(
      new Set(created.dispatches.map((dispatch: { id: string }) => dispatch.id)),
    );
  });

  it("normalizes the contact phone: strips spaces, keeps a leading + with no country-code inference", async () => {
    const withPlus = await post(validBody({ contactPhone: "+598 99 123 456" }));
    const createdWithPlus = await withPlus.json();
    expect(createdWithPlus.contactPhone).toBe("+59899123456");

    await testDb.truncateAll();
    await testDb.db.insert(schema.user).values({
      id: userId,
      name: "Test User",
      email: `${userId}@example.com`,
      emailVerified: true,
    });

    const withoutPlus = await post(validBody({ contactPhone: "099 123 456" }));
    const createdWithoutPlus = await withoutPlus.json();
    expect(createdWithoutPlus.contactPhone).toBe("099123456");
  });

  describe("idempotency (AC6)", () => {
    const badKeys: Array<[string, string | null, string]> = [
      ["a missing key", null, "MissingIdempotencyKey"],
      ["a key that is not a UUID", "not-a-uuid", "InvalidIdempotencyKey"],
      ["an oversized key", "a".repeat(10_000), "InvalidIdempotencyKey"],
    ];

    for (const [label, key, error] of badKeys) {
      it(`rejects ${label} with a 400 and stores nothing`, async () => {
        const response = await post(validBody(), key);

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error });
        const { requests } = await countRows();
        expect(requests).toBe(0);
      });
    }

    it("returns 200 with the original request and creates no new rows on an identical resubmit (whitespace + provider order only differ)", async () => {
      const key = randomUUID();
      const first = await post(validBody(), key);
      expect(first.status).toBe(201);
      const firstJson = await first.json();

      const second = await post(
        validBody({
          description: "  Renovar cocina completa  ",
          providerIds: ["testsrc-3", "testsrc-1", "testsrc-2"],
        }),
        key,
      );

      expect(second.status).toBe(200);
      const secondJson = await second.json();
      expect(secondJson).toEqual(firstJson);

      const { requests, dispatches } = await countRows();
      expect(requests).toBe(1);
      expect(dispatches).toBe(3);
    });

    it("returns 409 for the same key with a different payload (e.g. a changed area)", async () => {
      const key = randomUUID();
      const first = await post(validBody(), key);
      expect(first.status).toBe(201);

      const second = await post(validBody({ areaM2: 999 }), key);
      expect(second.status).toBe(409);

      const { requests } = await countRows();
      expect(requests).toBe(1);
    });

    it("scopes the idempotency key per (userId, key): a different user with the same key creates a separate request", async () => {
      const key = randomUUID();
      const first = await post(validBody(), key);
      expect(first.status).toBe(201);

      const otherUserId = randomUUID();
      await testDb.db.insert(schema.user).values({
        id: otherUserId,
        name: "Other User",
        email: `${otherUserId}@example.com`,
        emailVerified: true,
      });
      sessionHolder.current = { userId: otherUserId };

      const second = await post(validBody(), key);
      expect(second.status).toBe(201);

      const { requests } = await countRows();
      expect(requests).toBe(2);
    });

    // Both submits are held at a barrier inside provider search, which runs
    // after the idempotency lookup and before the insert, so both are
    // guaranteed to miss the lookup and race to the unique constraint.
    function racingSearch(): () => Promise<Provider[]> {
      let arrived = 0;
      let release: () => void = () => {};
      const bothArrived = new Promise<void>((resolve) => {
        release = resolve;
      });
      return async () => {
        arrived += 1;
        if (arrived === 2) {
          release();
        }
        await bothArrived;
        return TEST_PROVIDERS;
      };
    }

    it("resolves two concurrent identical submits with the same key to one created and one duplicate, never a 500", async () => {
      const { submitQuoteRequest } = await import("@/modules/requests/submit");
      const key = randomUUID();
      const searchProviders = racingSearch();
      const submit = () =>
        submitQuoteRequest(testDb.db, { userId, idempotencyKey: key, body: validBody() }, { dispatchQueue, searchProviders });

      const outcomes = (await Promise.all([submit(), submit()])).map((result) => result.outcome).sort();

      expect(outcomes).toEqual(["created", "duplicate"]);
      const { requests, dispatches } = await countRows();
      expect(requests).toBe(1);
      expect(dispatches).toBe(3);
    });

    it("resolves two concurrent submits with the same key but different payloads to one created and one conflict", async () => {
      const { submitQuoteRequest } = await import("@/modules/requests/submit");
      const key = randomUUID();
      const searchProviders = racingSearch();

      const outcomes = (
        await Promise.all([
          submitQuoteRequest(testDb.db, { userId, idempotencyKey: key, body: validBody() }, { dispatchQueue, searchProviders }),
          submitQuoteRequest(
            testDb.db,
            { userId, idempotencyKey: key, body: validBody({ areaM2: 95 }) },
            { dispatchQueue, searchProviders },
          ),
        ])
      )
        .map((result) => result.outcome)
        .sort();

      expect(outcomes).toEqual(["conflict", "created"]);
      const { requests } = await countRows();
      expect(requests).toBe(1);
    });
  });
});
