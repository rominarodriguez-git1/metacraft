import { describe, expect, it } from "vitest";
import { loadEnv, MissingEnvVarsError } from "@/lib/env";

const VALID_ENV = {
  DATABASE_URL: "postgres://metacraft:metacraft@localhost:5432/metacraft",
  SMTP_HOST: "localhost",
  SMTP_PORT: "1025",
  EMAIL_FROM: "no-reply@metacraft.test",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
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
});
