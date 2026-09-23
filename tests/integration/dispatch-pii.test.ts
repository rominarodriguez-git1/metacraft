import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, type TestDatabase } from "../helpers/db";
import { clearAdapters, registerAdapter } from "@/modules/providers/registry";
import type { ProviderAdapter } from "@/modules/providers/port";
import type { Provider, QuoteRequestPayload } from "@/modules/providers/types";
import * as schema from "@/db/schema";
import { submitQuoteRequest } from "@/modules/requests/submit";
import { processDispatchJob } from "@/modules/dispatch/handler";
import type { DispatchQueue } from "@/modules/dispatch/queue-port";

const CONTACT_PHONE = "099123456";
const DESCRIPTION = "Renovar cocina completa con ceramica nueva y pintura";
const USER_EMAIL_LOCAL = "sensitive-user";

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

function makeRecordingAdapter(sourceId: string): {
  adapter: ProviderAdapter;
  receivedPayloads: QuoteRequestPayload[];
} {
  const provider = makeProvider(sourceId);
  const receivedPayloads: QuoteRequestPayload[] = [];
  return {
    adapter: {
      sourceId,
      async search() {
        return [provider];
      },
      async dispatch(payload) {
        receivedPayloads.push(payload as QuoteRequestPayload);
        return { status: "sent" as const };
      },
    },
    receivedPayloads,
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
    description: DESCRIPTION,
    contactPhone: CONTACT_PHONE,
    providerIds: [],
    ...overrides,
  };
}

describe("dispatch PII isolation (AC10)", () => {
  let testDb: TestDatabase;
  let userId: string;
  let userEmail: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let loggedLines: string[];

  beforeAll(async () => {
    testDb = await createTestDatabase();
  });

  afterAll(async () => {
    await testDb.close();
  });

  beforeEach(async () => {
    userId = randomUUID();
    userEmail = `${USER_EMAIL_LOCAL}-${userId}@example.com`;
    await testDb.db.insert(schema.user).values({
      id: userId,
      name: "Test User",
      email: userEmail,
      emailVerified: true,
    });

    loggedLines = [];
    consoleSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      loggedLines.push(args.map((a) => String(a)).join(" "));
    });
  });

  afterEach(async () => {
    consoleSpy.mockRestore();
    clearAdapters();
    vi.clearAllMocks();
    await testDb.truncateAll();
  });

  it("delivers phone and description only to the selected providers' adapters, never email or a token, and no PII reaches logs", async () => {
    const selectedA = makeRecordingAdapter("selected-a");
    const selectedB = makeRecordingAdapter("selected-b");
    const notSelected = makeRecordingAdapter("not-selected");
    registerAdapter(selectedA.adapter);
    registerAdapter(selectedB.adapter);
    registerAdapter(notSelected.adapter);

    const dispatchQueue: DispatchQueue = { enqueueDispatch: vi.fn(async () => {}) };

    const result = await submitQuoteRequest(
      testDb.db,
      {
        userId,
        idempotencyKey: randomUUID(),
        body: validBody({ providerIds: ["selected-a-1", "selected-b-1"] }),
      },
      { dispatchQueue },
    );

    expect(result.outcome).toBe("created");
    if (result.outcome !== "created") return;

    for (const dispatch of result.data.dispatches) {
      await processDispatchJob(testDb.db, dispatch.id, { reportResponse: vi.fn(async () => {}) });
    }

    // Selected providers received the phone and description.
    expect(selectedA.receivedPayloads).toHaveLength(1);
    expect(selectedB.receivedPayloads).toHaveLength(1);
    expect(selectedA.receivedPayloads[0]?.contactPhone).toBe(CONTACT_PHONE);
    expect(selectedA.receivedPayloads[0]?.description).toBe(DESCRIPTION);
    expect(selectedB.receivedPayloads[0]?.contactPhone).toBe(CONTACT_PHONE);
    expect(selectedB.receivedPayloads[0]?.description).toBe(DESCRIPTION);

    // The non-selected adapter never got a dispatch call at all.
    expect(notSelected.receivedPayloads).toHaveLength(0);

    // Neither adapter payload carries an email or token field.
    for (const payload of [...selectedA.receivedPayloads, ...selectedB.receivedPayloads]) {
      expect(payload).not.toHaveProperty("email");
      expect(payload).not.toHaveProperty("token");
      expect(JSON.stringify(payload)).not.toContain(userEmail);
    }

    // No captured log line (across submit + dispatch processing) leaks phone, description or email.
    const combinedLogs = loggedLines.join("\n");
    expect(combinedLogs).not.toContain(CONTACT_PHONE);
    expect(combinedLogs).not.toContain(DESCRIPTION);
    expect(combinedLogs).not.toContain(userEmail);
  });
});
