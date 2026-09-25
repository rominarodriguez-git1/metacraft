import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startMaintenanceLoop, stopMaintenanceLoop } from "@/lib/maintenance";

describe("startMaintenanceLoop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stopMaintenanceLoop();
  });

  afterEach(() => {
    stopMaintenanceLoop();
    vi.useRealTimers();
  });

  it("runs every task immediately and then on each interval", async () => {
    const task = vi.fn().mockResolvedValue(undefined);

    startMaintenanceLoop([{ name: "a", run: task }], 1_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("keeps running the other tasks and the loop when one task throws", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("boom"));
    const healthy = vi.fn().mockResolvedValue(undefined);

    startMaintenanceLoop(
      [
        { name: "failing", run: failing },
        { name: "healthy", run: healthy },
      ],
      1_000,
    );
    await vi.advanceTimersByTimeAsync(1_000);

    expect(healthy).toHaveBeenCalledTimes(2);
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it("starts a single loop per process even when called twice", async () => {
    const task = vi.fn().mockResolvedValue(undefined);

    startMaintenanceLoop([{ name: "a", run: task }], 1_000);
    startMaintenanceLoop([{ name: "a", run: task }], 1_000);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(task).toHaveBeenCalledTimes(2);
  });
});
