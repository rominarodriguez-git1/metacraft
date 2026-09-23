import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ESLint } from "eslint";
import { logger } from "@/lib/logger";

function parseLoggedLines(spy: ReturnType<typeof vi.spyOn>): unknown[] {
  return spy.mock.calls.map((call: unknown[]) => JSON.parse(String(call[0])));
}

describe("logger", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("emits JSON lines", () => {
    logger.info("hello world");
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const raw = String(consoleSpy.mock.calls[0]?.[0]);
    expect(() => JSON.parse(raw)).not.toThrow();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("hello world");
  });

  describe("key-based redaction", () => {
    it("redacts values whose key contains a sensitive substring, at any nesting depth", () => {
      logger.info("user event", {
        userEmail: "person@example.com",
        contactPhone: "099123456",
        authToken: "abc123",
        password: "hunter2",
        secretValue: "shh",
        Authorization: "Bearer xyz",
        Cookie: "session=abc",
        nested: {
          description: "free text description",
          safe: "kept",
        },
      });

      const [entry] = parseLoggedLines(consoleSpy) as [Record<string, unknown>];
      expect(entry.userEmail).toBe("[REDACTED]");
      expect(entry.contactPhone).toBe("[REDACTED]");
      expect(entry.authToken).toBe("[REDACTED]");
      expect(entry.password).toBe("[REDACTED]");
      expect(entry.secretValue).toBe("[REDACTED]");
      expect(entry.Authorization).toBe("[REDACTED]");
      expect(entry.Cookie).toBe("[REDACTED]");
      expect((entry.nested as Record<string, unknown>).description).toBe("[REDACTED]");
      expect((entry.nested as Record<string, unknown>).safe).toBe("kept");
    });

    it("redacts sensitive keys inside arrays", () => {
      logger.info("bulk event", {
        items: [
          { email: "a@example.com", safe: "ok" },
          { token: "abcdefghijklmnopqrstuvwxyz0123456789" },
        ],
      });

      const [entry] = parseLoggedLines(consoleSpy) as [{ items: Array<Record<string, unknown>> }];
      expect(entry.items[0]?.email).toBe("[REDACTED]");
      expect(entry.items[0]?.safe).toBe("ok");
      expect(entry.items[1]?.token).toBe("[REDACTED]");
    });

    it("redacts sensitive keys on Error objects", () => {
      const err = new Error("failure") as Error & { password: string };
      err.password = "hunter2";
      logger.error("op failed", { err });

      const [entry] = parseLoggedLines(consoleSpy) as [{ err: Record<string, unknown> }];
      expect(entry.err.password).toBe("[REDACTED]");
    });
  });

  describe("free-text pattern redaction", () => {
    it("redacts an email address embedded in a message", () => {
      logger.info("contact us at person@example.com please");
      const [entry] = parseLoggedLines(consoleSpy) as [{ message: string }];
      expect(entry.message).not.toContain("person@example.com");
      expect(entry.message).toContain("[REDACTED]");
    });

    it("redacts a JWT-shaped token embedded in a message", () => {
      const jwt =
        "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PYTMLnAsvfg8";
      logger.info(`auth header was ${jwt}`);
      const [entry] = parseLoggedLines(consoleSpy) as [{ message: string }];
      expect(entry.message).not.toContain(jwt);
      expect(entry.message).toContain("[REDACTED]");
    });

    it("redacts a 32-char magic-link token embedded in a message", () => {
      const token = "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6";
      expect(token.length).toBe(32);
      logger.info(`magic link: https://app.test/verify?token=${token}`);
      const [entry] = parseLoggedLines(consoleSpy) as [{ message: string }];
      expect(entry.message).not.toContain(token);
      expect(entry.message).toContain("[REDACTED]");
    });

    it("redacts phone numbers embedded in a message", () => {
      logger.info("call +598 99 123 456 or 099123456 for support");
      const [entry] = parseLoggedLines(consoleSpy) as [{ message: string }];
      expect(entry.message).not.toContain("+598 99 123 456");
      expect(entry.message).not.toContain("099123456");
      expect(entry.message).toContain("[REDACTED]");
    });

    it("redacts free-text PII nested in objects and arrays", () => {
      logger.info("digest", {
        notes: ["reach me at person@example.com", "safe text"],
        nested: { blob: "call 099123456 now" },
      });
      const [entry] = parseLoggedLines(consoleSpy) as [
        {
          notes: string[];
          nested: { blob: string };
        },
      ];
      expect(entry.notes[0]).toContain("[REDACTED]");
      expect(entry.notes[0]).not.toContain("person@example.com");
      expect(entry.notes[1]).toBe("safe text");
      expect(entry.nested.blob).toContain("[REDACTED]");
      expect(entry.nested.blob).not.toContain("099123456");
    });

    it("redacts PII embedded in an Error message", () => {
      const err = new Error("failed to notify person@example.com at 099123456");
      logger.error("notify failed", { err });
      const [entry] = parseLoggedLines(consoleSpy) as [{ err: { message: string } }];
      expect(entry.err.message).not.toContain("person@example.com");
      expect(entry.err.message).not.toContain("099123456");
      expect(entry.err.message).toContain("[REDACTED]");
    });
  });

  describe("failure safety", () => {
    it("never throws and never emits the unredacted value when a getter throws", () => {
      const secretValue = "should-never-appear-in-logs";
      const poisoned = {
        get email() {
          throw new Error("boom");
        },
      };

      expect(() => logger.info("event", { poisoned, other: secretValue })).not.toThrow();

      const raw = String(consoleSpy.mock.calls[0]?.[0]);
      expect(raw).toContain("[REDACTED]");
      expect(raw).not.toContain(secretValue);
    });
  });
});

describe("no-console lint rule", () => {
  it("fails a fixture file that calls console.log directly", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const results = await eslint.lintText('console.log("leak");\n', {
      filePath: "src/lib/__console-fixture__.ts",
    });

    const messages = results.flatMap((result) => result.messages);
    expect(messages.some((message) => message.ruleId === "no-console")).toBe(true);
  });

  it("allows console usage inside src/lib/logger.ts", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const results = await eslint.lintText('console.log("ok");\n', {
      filePath: "src/lib/logger.ts",
    });

    const messages = results.flatMap((result) => result.messages);
    expect(messages.some((message) => message.ruleId === "no-console")).toBe(false);
  });
});
