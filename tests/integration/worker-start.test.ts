import { beforeEach, describe, expect, it, vi } from "vitest";

const workMock = vi.fn().mockResolvedValue("worker-id");
const startMock = vi.fn().mockResolvedValue(undefined);
const createQueueMock = vi.fn().mockResolvedValue(undefined);
const updateQueueMock = vi.fn().mockResolvedValue(undefined);
const onMock = vi.fn();
const sendMock = vi.fn().mockResolvedValue("job-id");

class MockPgBoss {
  start = startMock;
  createQueue = createQueueMock;
  updateQueue = updateQueueMock;
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
    // Fresh module per test: the pg-boss singleton and its prepared-queue
    // memo live at module scope.
    vi.resetModules();
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

    // work(name, options, handler): the handler is the last argument.
    const registeredWorkHandler = workMock.mock.calls[0]?.at(-1) as (
      jobs: Array<{ data: { dispatchId: string } }>,
    ) => Promise<void>;
    await registeredWorkHandler([{ data: { dispatchId: "dispatch-1" } }, { data: { dispatchId: "dispatch-2" } }]);

    expect(handler).toHaveBeenCalledWith("dispatch-1");
    expect(handler).toHaveBeenCalledWith("dispatch-2");
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("registers concurrent single-job workers with a short poll on an exclusive, NOTIFY-enabled queue", async () => {
    const { startDispatchWorker, DISPATCH_QUEUE_NAME } = await import("@/modules/dispatch/pgboss-queue");

    await startDispatchWorker(vi.fn().mockResolvedValue(undefined));

    expect(workMock).toHaveBeenCalledWith(
      DISPATCH_QUEUE_NAME,
      { localConcurrency: 5, pollingIntervalSeconds: 0.5, notifyPollingIntervalSeconds: 0.5, batchSize: 1 },
      expect.any(Function),
    );
    expect(createQueueMock).toHaveBeenCalledWith(DISPATCH_QUEUE_NAME, { notify: true, policy: "exclusive" });
    expect(updateQueueMock).toHaveBeenCalledWith(DISPATCH_QUEUE_NAME, { notify: true });
  });

  it("shares one registration between concurrent start calls", async () => {
    const { startDispatchWorker } = await import("@/modules/dispatch/pgboss-queue");
    const handler = vi.fn().mockResolvedValue(undefined);

    await Promise.all([startDispatchWorker(handler), startDispatchWorker(handler)]);

    expect(workMock).toHaveBeenCalledTimes(1);
  });

  it("lets a later call retry after a failed start instead of leaving the process without a worker", async () => {
    const { startDispatchWorker } = await import("@/modules/dispatch/pgboss-queue");
    const handler = vi.fn().mockResolvedValue(undefined);
    startMock.mockRejectedValueOnce(new Error("database unreachable"));

    await expect(startDispatchWorker(handler)).rejects.toThrow("database unreachable");
    expect(workMock).not.toHaveBeenCalled();

    await startDispatchWorker(handler);
    expect(workMock).toHaveBeenCalledTimes(1);
  });

  it("keys every job by its dispatchId so the queue can deduplicate re-enqueues", async () => {
    const { createPgBossDispatchQueue, DISPATCH_QUEUE_NAME } = await import("@/modules/dispatch/pgboss-queue");

    await createPgBossDispatchQueue().enqueueDispatch("dispatch-7");

    expect(sendMock).toHaveBeenCalledWith(
      DISPATCH_QUEUE_NAME,
      { dispatchId: "dispatch-7" },
      { singletonKey: "dispatch-7" },
    );
  });
});
