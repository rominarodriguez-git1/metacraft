import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MissingDatabaseUrlError, requireDatabaseUrl } from "@/db/database-url";

describe("requireDatabaseUrl", () => {
  it("returns DATABASE_URL when it is set", () => {
    expect(requireDatabaseUrl({ DATABASE_URL: "postgres://example/db" })).toBe(
      "postgres://example/db",
    );
  });

  it("throws a named error instead of falling back to a built-in connection string", () => {
    expect(() => requireDatabaseUrl({})).toThrow(MissingDatabaseUrlError);
    expect(() => requireDatabaseUrl({ DATABASE_URL: "" })).toThrow(/DATABASE_URL/);
  });
});

describe("db client", () => {
  const original = process.env.DATABASE_URL;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = original;
    }
  });

  it("can be imported without DATABASE_URL (as next build does) and throws only on first use", async () => {
    // Import both after resetModules, so the error class is the same copy the
    // freshly loaded client throws.
    const { db } = await import("@/db/client");
    const fresh = await import("@/db/database-url");

    expect(() => db.select()).toThrow(fresh.MissingDatabaseUrlError);
  });
});
