import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadEnvMock = vi.fn();
const startDispatchWorkerMock = vi.fn();
const startMaintenanceLoopMock = vi.fn();

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
  pgBossDispatchQueue: {},
}));
vi.mock("@/modules/dispatch/sweeper", () => ({ requeueStalePendingDispatches: vi.fn() }));
vi.mock("@/modules/auth/rate-limit-retention", () => ({ pruneRateLimitHits: vi.fn() }));
vi.mock("@/lib/maintenance", () => ({ startMaintenanceLoop: startMaintenanceLoopMock }));

describe("instrumentation register", () => {
  const originalRuntime = process.env.NEXT_RUNTIME;

  beforeEach(() => {
    vi.resetModules();
    loadEnvMock.mockReset();
    startDispatchWorkerMock.mockReset().mockResolvedValue(undefined);
    startMaintenanceLoopMock.mockReset();
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
    expect(startMaintenanceLoopMock).not.toHaveBeenCalled();
  });

  it("starts the worker exactly once when the environment is valid", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    loadEnvMock.mockReturnValue({});

    const { register } = await import("@/instrumentation");
    await register();

    expect(loadEnvMock).toHaveBeenCalledTimes(1);
    expect(startDispatchWorkerMock).toHaveBeenCalledTimes(1);
  });

  it("starts the stale-dispatch maintenance loop after the worker when the environment is valid", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    loadEnvMock.mockReturnValue({});

    const { register } = await import("@/instrumentation");
    await register();

    expect(startMaintenanceLoopMock).toHaveBeenCalledTimes(1);
    const [tasks, intervalMs] = startMaintenanceLoopMock.mock.calls[0] as [Array<{ name: string }>, number];
    expect(tasks.map((task) => task.name)).toEqual(
      expect.arrayContaining(["requeue-stale-dispatches", "prune-rate-limit-hits"]),
    );
    expect(intervalMs).toBeGreaterThan(0);
    expect(startDispatchWorkerMock.mock.invocationCallOrder[0]).toBeLessThan(
      startMaintenanceLoopMock.mock.invocationCallOrder[0] as number,
    );
  });

  it("runs neither env validation nor worker start on the Edge runtime", async () => {
    process.env.NEXT_RUNTIME = "edge";

    const { register } = await import("@/instrumentation");
    await register();

    expect(loadEnvMock).not.toHaveBeenCalled();
    expect(startDispatchWorkerMock).not.toHaveBeenCalled();
    expect(startMaintenanceLoopMock).not.toHaveBeenCalled();
  });
});
