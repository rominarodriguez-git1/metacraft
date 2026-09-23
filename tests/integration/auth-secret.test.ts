import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDatabase, type TestDatabase } from "../helpers/db";
import { createAuth } from "@/modules/auth/auth";
import { MissingEnvVarsError } from "@/lib/env";

const VALID_TEST_SECRET = "0123456789abcdef0123456789abcdef";

describe("auth secret", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
  });

  afterAll(async () => {
    await testDb.close();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws naming BETTER_AUTH_SECRET when creating auth in production without a secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_SECRET", "");

    let caught: unknown;
    try {
      createAuth({ db: testDb.db });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MissingEnvVarsError);
    const error = caught as MissingEnvVarsError;
    expect(error.missing).toEqual(["BETTER_AUTH_SECRET"]);
    expect(error.message).toContain("BETTER_AUTH_SECRET");
  });

  it("creates auth when a 32+ character secret is provided explicitly", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_SECRET", "");

    expect(() => createAuth({ db: testDb.db, secret: VALID_TEST_SECRET })).not.toThrow();
  });

  it("creates auth when a valid BETTER_AUTH_SECRET env var is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_SECRET", VALID_TEST_SECRET);

    expect(() => createAuth({ db: testDb.db })).not.toThrow();
  });
});
