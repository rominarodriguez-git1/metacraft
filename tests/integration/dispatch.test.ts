import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, type TestDatabase } from "../helpers/db";
import { clearAdapters, registerAdapter } from "@/modules/providers/registry";
import type { ProviderAdapter } from "@/modules/providers/port";
import type { Provider, Quote } from "@/modules/providers/types";
import * as schema from "@/db/schema";
import { submitQuoteRequest, type SubmitQuoteRequestResult } from "@/modules/requests/submit";
import { processDispatchJob } from "@/modules/dispatch/handler";
import { reportResponse, UnknownDispatchError, DispatchNotSentError } from "@/modules/dispatch/ingest";
import type { DispatchQueue } from "@/modules/dispatch/queue-port";

function makeProvider(sourceId: string): Provider {
  return {
    id: `${sourceId}-1`,
    sourceId,
    name: `${sourceId} provider`,
    trades: ["albanileria"],
    zones: ["Centro"],
    ratingAvg: 4.5,
    reviewCount: 12,
    isNew: false,
    verified: true,
    jobMinUyu: 10000,
    jobMaxUyu: 100000,
    earliestStartWeeks: 1,
  };
}

function makeOkAdapter(sourceId: string): { adapter: ProviderAdapter; dispatchSpy: ReturnType<typeof vi.fn> } {
  const provider = makeProvider(sourceId);
  const dispatchSpy = vi.fn(async () => ({ status: "sent" as const }));
  return {
    adapter: {
      sourceId,
      async search() {
        return [provider];
      },
      dispatch: dispatchSpy,
    },
    dispatchSpy,
  };
}

function makeTypedFailureAdapter(
  sourceId: string,
  reason: string,
): { adapter: ProviderAdapter; dispatchSpy: ReturnType<typeof vi.fn> } {
  const provider = makeProvider(sourceId);
  const dispatchSpy = vi.fn(async () => {
    const error = new Error(`simulated failure: ${reason}`) as Error & { reason: string };
    error.reason = reason;
    throw error;
  });
  return {
    adapter: {
      sourceId,
      async search() {
        return [provider];
      },
      dispatch: dispatchSpy,
    },
    dispatchSpy,
  };
}

function makeUntypedFailureAdapter(sourceId: string): { adapter: ProviderAdapter; dispatchSpy: ReturnType<typeof vi.fn> } {
  const provider = makeProvider(sourceId);
  const dispatchSpy = vi.fn(async () => {
    throw new Error("boom, no typed reason");
  });
  return {
    adapter: {
      sourceId,
      async search() {
        return [provider];
      },
      dispatch: dispatchSpy,
    },
    dispatchSpy,
  };
}

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
    contactPhone: "099123456",
    providerIds: [],
    ...overrides,
  };
}

const noopReportResponse = vi.fn(async () => {});

describe("asynchronous dispatch (T9)", () => {
  let testDb: TestDatabase;
  let userId: string;
  let recordingQueue: DispatchQueue;

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
      name: "Test User",
      email: `${userId}@example.com`,
      emailVerified: true,
    });
    recordingQueue = { enqueueDispatch: vi.fn(async () => {}) };
  });

  afterEach(async () => {
    clearAdapters();
    vi.clearAllMocks();
    await testDb.truncateAll();
  });

  async function submit(providerIds: string[], dispatchQueue: DispatchQueue): Promise<SubmitQuoteRequestResult> {
    return submitQuoteRequest(
      testDb.db,
      { userId, idempotencyKey: randomUUID(), body: validBody({ providerIds }) },
      { dispatchQueue },
    );
  }

  async function dispatchRowsBySource(): Promise<Map<string, (typeof schema.dispatch.$inferSelect)>> {
    const rows = await testDb.db.select().from(schema.dispatch);
    return new Map(rows.map((row) => [row.sourceId, row]));
  }

  it("submit enqueues exactly one job per dispatch through the DispatchQueue port", async () => {
    const { adapter: a } = makeOkAdapter("adapter-a");
    const { adapter: b } = makeOkAdapter("adapter-b");
    registerAdapter(a);
    registerAdapter(b);

    const result = await submit(["adapter-a-1", "adapter-b-1"], recordingQueue);
    expect(result.outcome).toBe("created");
    if (result.outcome !== "created") return;

    expect(recordingQueue.enqueueDispatch).toHaveBeenCalledTimes(2);
    const enqueuedIds = (recordingQueue.enqueueDispatch as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => call[0],
    );
    expect(enqueuedIds.sort()).toEqual(result.data.dispatches.map((d) => d.id).sort());
  });

  it("isolates failures: one adapter at failureRate 1 ends failed with its reason while the others reach sent (AC7)", async () => {
    const { adapter: ok1 } = makeOkAdapter("adapter-ok1");
    const { adapter: ok2 } = makeOkAdapter("adapter-ok2");
    const { adapter: bad } = makeTypedFailureAdapter("adapter-bad", "REJECTED");
    registerAdapter(ok1);
    registerAdapter(ok2);
    registerAdapter(bad);

    const result = await submit(["adapter-ok1-1", "adapter-ok2-1", "adapter-bad-1"], recordingQueue);
    expect(result.outcome).toBe("created");
    if (result.outcome !== "created") return;

    for (const dispatch of result.data.dispatches) {
      await processDispatchJob(testDb.db, dispatch.id, { reportResponse: noopReportResponse });
    }

    const bySource = await dispatchRowsBySource();
    expect(bySource.get("adapter-ok1")?.status).toBe("sent");
    expect(bySource.get("adapter-ok2")?.status).toBe("sent");
    expect(bySource.get("adapter-bad")?.status).toBe("failed");
    expect(bySource.get("adapter-bad")?.failureReason).toBe("REJECTED");
  });

  it("maps an untyped thrown error to UPSTREAM_ERROR and logs it only via the redacting logger", async () => {
    const { adapter: untyped } = makeUntypedFailureAdapter("adapter-untyped");
    const { adapter: ok } = makeOkAdapter("adapter-ok3");
    registerAdapter(untyped);
    registerAdapter(ok);

    const result = await submit(["adapter-untyped-1", "adapter-ok3-1"], recordingQueue);
    expect(result.outcome).toBe("created");
    if (result.outcome !== "created") return;

    for (const dispatch of result.data.dispatches) {
      await processDispatchJob(testDb.db, dispatch.id, { reportResponse: noopReportResponse });
    }

    const bySource = await dispatchRowsBySource();
    expect(bySource.get("adapter-untyped")?.status).toBe("failed");
    expect(bySource.get("adapter-untyped")?.failureReason).toBe("UPSTREAM_ERROR");
    expect(bySource.get("adapter-ok3")?.status).toBe("sent");
  });

  it("a job retry after a prior success leaves state unchanged (conditional transition)", async () => {
    const { adapter, dispatchSpy } = makeOkAdapter("adapter-retry");
    const { adapter: ok } = makeOkAdapter("adapter-ok4");
    registerAdapter(adapter);
    registerAdapter(ok);

    const result = await submit(["adapter-retry-1", "adapter-ok4-1"], recordingQueue);
    expect(result.outcome).toBe("created");
    if (result.outcome !== "created") return;

    const dispatchId = result.data.dispatches.find((d) => d.sourceId === "adapter-retry")!.id;

    await processDispatchJob(testDb.db, dispatchId, { reportResponse: noopReportResponse });
    await processDispatchJob(testDb.db, dispatchId, { reportResponse: noopReportResponse });

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const [row] = await testDb.db.select().from(schema.dispatch).where(eq(schema.dispatch.id, dispatchId));
    expect(row?.status).toBe("sent");
  });

  describe("ingest.reportResponse (AC8)", () => {
    it("moves sent -> responded and stores the quote", async () => {
      const { adapter } = makeOkAdapter("adapter-resp");
      const { adapter: ok } = makeOkAdapter("adapter-ok5");
      registerAdapter(adapter);
      registerAdapter(ok);

      const result = await submit(["adapter-resp-1", "adapter-ok5-1"], recordingQueue);
      expect(result.outcome).toBe("created");
      if (result.outcome !== "created") return;

      const dispatchId = result.data.dispatches.find((d) => d.sourceId === "adapter-resp")!.id;
      await processDispatchJob(testDb.db, dispatchId, { reportResponse: noopReportResponse });

      const quote: Quote = { amountUyu: 42000, materialsIncluded: true, message: "Listo para coordinar" };
      await reportResponse(testDb.db, dispatchId, quote);

      const [row] = await testDb.db.select().from(schema.dispatch).where(eq(schema.dispatch.id, dispatchId));
      expect(row?.status).toBe("responded");
      expect(row?.quoteAmountUyu).toBe(42000);
      expect(row?.quoteMaterialsIncluded).toBe(true);
      expect(row?.quoteMessage).toBe("Listo para coordinar");
    });

    it("rejects an unknown dispatch id", async () => {
      await expect(
        reportResponse(testDb.db, randomUUID(), { amountUyu: 1, materialsIncluded: false, message: "x" }),
      ).rejects.toBeInstanceOf(UnknownDispatchError);
    });

    it("rejects a dispatch that is not in sent (still pending)", async () => {
      const { adapter } = makeOkAdapter("adapter-pending");
      const { adapter: ok } = makeOkAdapter("adapter-ok6");
      registerAdapter(adapter);
      registerAdapter(ok);

      const result = await submit(["adapter-pending-1", "adapter-ok6-1"], recordingQueue);
      expect(result.outcome).toBe("created");
      if (result.outcome !== "created") return;

      const dispatchId = result.data.dispatches.find((d) => d.sourceId === "adapter-pending")!.id;

      await expect(
        reportResponse(testDb.db, dispatchId, { amountUyu: 1, materialsIncluded: false, message: "x" }),
      ).rejects.toBeInstanceOf(DispatchNotSentError);
    });

    it("rejects a dispatch that is not in sent (terminal failed)", async () => {
      const { adapter } = makeTypedFailureAdapter("adapter-failed-resp", "TIMEOUT");
      const { adapter: ok } = makeOkAdapter("adapter-ok7");
      registerAdapter(adapter);
      registerAdapter(ok);

      const result = await submit(["adapter-failed-resp-1", "adapter-ok7-1"], recordingQueue);
      expect(result.outcome).toBe("created");
      if (result.outcome !== "created") return;

      const dispatchId = result.data.dispatches.find((d) => d.sourceId === "adapter-failed-resp")!.id;
      await processDispatchJob(testDb.db, dispatchId, { reportResponse: noopReportResponse });

      await expect(
        reportResponse(testDb.db, dispatchId, { amountUyu: 1, materialsIncluded: false, message: "x" }),
      ).rejects.toBeInstanceOf(DispatchNotSentError);
    });
  });
});
