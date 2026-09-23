import { describe, expect, it } from "vitest";
import { loadEnv, MissingEnvVarsError } from "@/lib/env";

const TEST_SECRET = "0123456789abcdef0123456789abcdef";

const VALID_ENV = {
  DATABASE_URL: "postgres://metacraft:metacraft@localhost:5432/metacraft",
  SMTP_HOST: "localhost",
  SMTP_PORT: "1025",
  EMAIL_FROM: "no-reply@metacraft.test",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: TEST_SECRET,
} satisfies Record<string, string>;

describe("env", () => {
  it("returns the parsed env when every required variable is present", () => {
    const result = loadEnv({ ...VALID_ENV });
    expect(result).toEqual(VALID_ENV);
  });

  it("throws a named MissingEnvVarsError listing missing variable names", () => {
    const { DATABASE_URL, EMAIL_FROM, ...rest } = VALID_ENV;
    void DATABASE_URL;
    void EMAIL_FROM;

    let caught: unknown;
    try {
      loadEnv({ ...rest });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MissingEnvVarsError);
    const error = caught as MissingEnvVarsError;
    expect(error.name).toBe("MissingEnvVarsError");
    expect(error.missing).toEqual(["DATABASE_URL", "EMAIL_FROM"]);
  });

  it("never includes variable values in the thrown error message", () => {
    const secretValue = "super-secret-connection-string";

    let caught: unknown;
    try {
      loadEnv({ SMTP_HOST: "localhost" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MissingEnvVarsError);
    const error = caught as MissingEnvVarsError;
    expect(error.message).not.toContain(secretValue);
    expect(error.message).toContain("DATABASE_URL");
    expect(error.message).not.toMatch(/localhost/);
  });

  it("throws naming BETTER_AUTH_SECRET when it is missing", () => {
    const { BETTER_AUTH_SECRET, ...rest } = VALID_ENV;
    void BETTER_AUTH_SECRET;

    let caught: unknown;
    try {
      loadEnv({ ...rest });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MissingEnvVarsError);
    const error = caught as MissingEnvVarsError;
    expect(error.missing).toEqual(["BETTER_AUTH_SECRET"]);
  });

  it("throws naming BETTER_AUTH_SECRET when it is shorter than 32 characters, without leaking the value", () => {
    const shortSecret = "too-short-secret";

    let caught: unknown;
    try {
      loadEnv({ ...VALID_ENV, BETTER_AUTH_SECRET: shortSecret });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MissingEnvVarsError);
    const error = caught as MissingEnvVarsError;
    expect(error.missing).toEqual(["BETTER_AUTH_SECRET"]);
    expect(error.message).not.toContain(shortSecret);
  });

  it("does not require RESEND_API_KEY outside production", () => {
    const result = loadEnv({ ...VALID_ENV });
    expect(result).toEqual(VALID_ENV);
  });

  it("throws naming RESEND_API_KEY when NODE_ENV is production and it is missing", () => {
    let caught: unknown;
    try {
      loadEnv({ ...VALID_ENV, NODE_ENV: "production" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MissingEnvVarsError);
    const error = caught as MissingEnvVarsError;
    expect(error.missing).toEqual(["RESEND_API_KEY"]);
  });

  it("succeeds in production when RESEND_API_KEY is present", () => {
    const result = loadEnv({ ...VALID_ENV, NODE_ENV: "production", RESEND_API_KEY: "re_test_key" });
    expect(result).toEqual({ ...VALID_ENV, RESEND_API_KEY: "re_test_key" });
  });
});
