import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { APIError } from "better-auth/api";
import { createTestDatabase, type TestDatabase } from "../helpers/db";
import { createAuth } from "@/modules/auth/auth";
import * as schema from "@/db/schema";

describe("magic-link rate limiting", () => {
  let testDb: TestDatabase;
  let auth: ReturnType<typeof createAuth>;

  beforeAll(async () => {
    testDb = await createTestDatabase();
  });

  afterAll(async () => {
    await testDb.close();
  });

  beforeEach(() => {
    auth = createAuth({
      db: testDb.db,
      mailer: {
        async sendMagicLink() {
          // no-op: these tests only care about the rate-limit hook.
        },
      },
    });
  });

  afterEach(async () => {
    await testDb.truncateAll();
    vi.useRealTimers();
  });

  function send(email: string, ip: string) {
    return auth.api.signInMagicLink({
      body: { email },
      headers: new Headers({ "x-forwarded-for": ip }),
    });
  }

  async function expectRateLimited(promise: Promise<unknown>): Promise<InstanceType<typeof APIError>> {
    let caught: unknown;
    try {
      await promise;
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(APIError);
    const apiError = caught as InstanceType<typeof APIError>;
    expect(apiError.statusCode).toBe(429);
    return apiError;
  }

  it("limits a single email to 1 request per 60 seconds", async () => {
    await send("throttled@example.com", "203.0.113.1");

    await expectRateLimited(send("throttled@example.com", "203.0.113.1"));
  });

  it("limits a single email to 5 requests per hour even once the 60s window has passed", async () => {
    vi.useFakeTimers();
    const start = Date.now();

    for (let i = 0; i < 5; i += 1) {
      vi.setSystemTime(start + i * 61_000);
      await send("hourly@example.com", "203.0.113.2");
    }

    vi.setSystemTime(start + 5 * 61_000);
    await expectRateLimited(send("hourly@example.com", "203.0.113.2"));
  });

  it("limits a single IP to 20 requests per hour across different emails", async () => {
    vi.useFakeTimers();
    const start = Date.now();

    for (let i = 0; i < 20; i += 1) {
      vi.setSystemTime(start + i * 61_000);
      await send(`user-${i}@example.com`, "203.0.113.3");
    }

    vi.setSystemTime(start + 20 * 61_000);
    await expectRateLimited(send("user-20@example.com", "203.0.113.3"));
  });

  it("returns a byte-identical generic 429 body whether or not the email belongs to an existing account", async () => {
    await testDb.db.insert(schema.user).values({
      id: randomUUID(),
      name: "Existing User",
      email: "existing@example.com",
      emailVerified: true,
    });

    await send("existing@example.com", "203.0.113.4");
    const existingError = await expectRateLimited(send("existing@example.com", "203.0.113.4"));

    await send("brand-new-nobody@example.com", "203.0.113.5");
    const newEmailError = await expectRateLimited(send("brand-new-nobody@example.com", "203.0.113.5"));

    expect(JSON.stringify(newEmailError.body)).toBe(JSON.stringify(existingError.body));
  });
});
