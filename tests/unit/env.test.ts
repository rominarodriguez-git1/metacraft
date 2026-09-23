import { describe, expect, it } from "vitest";
import { loadEnv, MissingEnvVarsError } from "@/lib/env";

const TEST_SECRET = "0123456789abcdef0123456789abcdef";

const SMTP_ENV = {
  DATABASE_URL: "postgres://metacraft:metacraft@localhost:5432/metacraft",
  EMAIL_PROVIDER: "smtp",
  SMTP_HOST: "localhost",
  SMTP_PORT: "1025",
  EMAIL_FROM: "no-reply@metacraft.test",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: TEST_SECRET,
} satisfies Record<string, string>;

const RESEND_ENV = {
  DATABASE_URL: "postgres://metacraft:metacraft@localhost:5432/metacraft",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: "no-reply@metacraft.test",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: TEST_SECRET,
} satisfies Record<string, string>;

describe("env", () => {
  it("returns the parsed env when every required smtp variable is present", () => {
    const result = loadEnv({ ...SMTP_ENV });
    expect(result).toEqual(SMTP_ENV);
  });

  it("returns the parsed env when every required resend variable is present", () => {
    const result = loadEnv({ ...RESEND_ENV });
    expect(result).toEqual(RESEND_ENV);
  });

  it("throws a named MissingEnvVarsError listing missing variable names", () => {
    const { DATABASE_URL, EMAIL_FROM, ...rest } = SMTP_ENV;
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
    const { BETTER_AUTH_SECRET, ...rest } = SMTP_ENV;
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
      loadEnv({ ...SMTP_ENV, BETTER_AUTH_SECRET: shortSecret });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MissingEnvVarsError);
    const error = caught as MissingEnvVarsError;
    expect(error.missing).toEqual(["BETTER_AUTH_SECRET"]);
    expect(error.message).not.toContain(shortSecret);
  });

  it("throws naming EMAIL_PROVIDER when it is missing", () => {
    const { EMAIL_PROVIDER, ...rest } = SMTP_ENV;
    void EMAIL_PROVIDER;

    let caught: unknown;
    try {
      loadEnv({ ...rest });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MissingEnvVarsError);
    const error = caught as MissingEnvVarsError;
    expect(error.missing).toEqual(["EMAIL_PROVIDER"]);
  });

  it("throws naming EMAIL_PROVIDER when it is neither smtp nor resend", () => {
    let caught: unknown;
    try {
      loadEnv({ ...SMTP_ENV, EMAIL_PROVIDER: "mailgun" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MissingEnvVarsError);
    const error = caught as MissingEnvVarsError;
    expect(error.missing).toEqual(["EMAIL_PROVIDER"]);
    expect(error.message).not.toContain("mailgun");
  });

  it("throws naming SMTP_HOST and SMTP_PORT when EMAIL_PROVIDER=smtp and they are missing", () => {
    const { SMTP_HOST, SMTP_PORT, ...rest } = SMTP_ENV;
    void SMTP_HOST;
    void SMTP_PORT;

    let caught: unknown;
    try {
      loadEnv({ ...rest });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MissingEnvVarsError);
    const error = caught as MissingEnvVarsError;
    expect(error.missing).toEqual(["SMTP_HOST", "SMTP_PORT"]);
  });

  it("does not require SMTP_HOST or SMTP_PORT when EMAIL_PROVIDER=resend", () => {
    const result = loadEnv({ ...RESEND_ENV });
    expect(result).toEqual(RESEND_ENV);
  });

  it("throws naming RESEND_API_KEY when EMAIL_PROVIDER=resend and it is missing", () => {
    const { RESEND_API_KEY, ...rest } = RESEND_ENV;
    void RESEND_API_KEY;

    let caught: unknown;
    try {
      loadEnv({ ...rest });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MissingEnvVarsError);
    const error = caught as MissingEnvVarsError;
    expect(error.missing).toEqual(["RESEND_API_KEY"]);
  });

  it("does not require RESEND_API_KEY when EMAIL_PROVIDER=smtp, even in production", () => {
    const result = loadEnv({ ...SMTP_ENV, NODE_ENV: "production" });
    expect(result).toEqual(SMTP_ENV);
  });

  it("requires RESEND_API_KEY when EMAIL_PROVIDER=resend regardless of NODE_ENV", () => {
    const { RESEND_API_KEY, ...rest } = RESEND_ENV;
    void RESEND_API_KEY;

    let caught: unknown;
    try {
      loadEnv({ ...rest, NODE_ENV: "development" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MissingEnvVarsError);
    const error = caught as MissingEnvVarsError;
    expect(error.missing).toEqual(["RESEND_API_KEY"]);
  });

  it("succeeds with EMAIL_PROVIDER=resend in production when RESEND_API_KEY is present", () => {
    const result = loadEnv({ ...RESEND_ENV, NODE_ENV: "production" });
    expect(result).toEqual(RESEND_ENV);
  });
});
