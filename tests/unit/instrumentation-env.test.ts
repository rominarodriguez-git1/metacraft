import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadEnvMock = vi.fn();
const startDispatchWorkerMock = vi.fn();

class FakeMissingEnvVarsError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`Missing required environment variables: ${missing.join(", ")}`);
    this.name = "MissingEnvVarsError";
    this.missing = missing;
  }
}

vi.mock("@/lib/env", () => ({
  loadEnv: loadEnvMock,
  MissingEnvVarsError: FakeMissingEnvVarsError,
}));

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/modules/dispatch/handler", () => ({ processDispatchJob: vi.fn() }));
vi.mock("@/modules/dispatch/ingest", () => ({ reportResponse: vi.fn() }));
vi.mock("@/modules/dispatch/pgboss-queue", () => ({
  startDispatchWorker: startDispatchWorkerMock,
}));

describe("instrumentation register", () => {
  const originalRuntime = process.env.NEXT_RUNTIME;

  beforeEach(() => {
    vi.resetModules();
    loadEnvMock.mockReset();
    startDispatchWorkerMock.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalRuntime === undefined) {
      delete process.env.NEXT_RUNTIME;
    } else {
      process.env.NEXT_RUNTIME = originalRuntime;
    }
  });

  it("rejects with MissingEnvVarsError naming the missing variable and never starts the worker", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const secretValue = "super-secret-connection-string";
    loadEnvMock.mockImplementation(() => {
      throw new FakeMissingEnvVarsError(["DATABASE_URL"]);
    });

    const { register } = await import("@/instrumentation");

    let caught: unknown;
    try {
      await register();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(FakeMissingEnvVarsError);
    const error = caught as FakeMissingEnvVarsError;
    expect(error.missing).toEqual(["DATABASE_URL"]);
    expect(error.message).toContain("DATABASE_URL");
    expect(error.message).not.toContain(secretValue);
    expect(startDispatchWorkerMock).not.toHaveBeenCalled();
  });

  it("starts the worker exactly once when the environment is valid", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    loadEnvMock.mockReturnValue({});

    const { register } = await import("@/instrumentation");
    await register();

    expect(loadEnvMock).toHaveBeenCalledTimes(1);
    expect(startDispatchWorkerMock).toHaveBeenCalledTimes(1);
  });

  it("runs neither env validation nor worker start on the Edge runtime", async () => {
    process.env.NEXT_RUNTIME = "edge";

    const { register } = await import("@/instrumentation");
    await register();

    expect(loadEnvMock).not.toHaveBeenCalled();
    expect(startDispatchWorkerMock).not.toHaveBeenCalled();
  });
});
