import { beforeEach, describe, expect, it, vi } from "vitest";

const workMock = vi.fn().mockResolvedValue("worker-id");
const startMock = vi.fn().mockResolvedValue(undefined);
const createQueueMock = vi.fn().mockResolvedValue(undefined);
const onMock = vi.fn();
const sendMock = vi.fn().mockResolvedValue("job-id");

class MockPgBoss {
  start = startMock;
  createQueue = createQueueMock;
  work = workMock;
  on = onMock;
  send = sendMock;
}

vi.mock("pg-boss", () => ({
  PgBoss: MockPgBoss,
}));

describe("startDispatchWorker (Node runtime, globalThis-guarded)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as Record<string, unknown>).__metacraftDispatchWorkerStarted;
  });

  it("registers boss.work exactly once even when the start function is called twice", async () => {
    const { startDispatchWorker } = await import("@/modules/dispatch/pgboss-queue");
    const handler = vi.fn().mockResolvedValue(undefined);

    await startDispatchWorker(handler);
    await startDispatchWorker(handler);

    expect(workMock).toHaveBeenCalledTimes(1);
  });

  it("dispatches each fetched job's dispatchId to the provided handler", async () => {
    const { startDispatchWorker } = await import("@/modules/dispatch/pgboss-queue");
    const handler = vi.fn().mockResolvedValue(undefined);

    await startDispatchWorker(handler);

    const registeredWorkHandler = workMock.mock.calls[0]?.[1] as (
      jobs: Array<{ data: { dispatchId: string } }>,
    ) => Promise<void>;
    await registeredWorkHandler([{ data: { dispatchId: "dispatch-1" } }, { data: { dispatchId: "dispatch-2" } }]);

    expect(handler).toHaveBeenCalledWith("dispatch-1");
    expect(handler).toHaveBeenCalledWith("dispatch-2");
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
