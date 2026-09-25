import { logger } from "@/lib/logger";

export interface MaintenanceTask {
  name: string;
  run: () => Promise<unknown>;
}

declare global {
  var __metacraftMaintenanceTimer: ReturnType<typeof setInterval> | undefined;
}

/**
 * Runs each task once immediately, then every `intervalMs`. A failing task is
 * logged and never stops the others or the loop. Guarded on globalThis so
 * repeated instrumentation register() calls start a single loop per process.
 */
export function startMaintenanceLoop(tasks: MaintenanceTask[], intervalMs: number): void {
  if (globalThis.__metacraftMaintenanceTimer) {
    return;
  }

  const runAll = async (): Promise<void> => {
    for (const task of tasks) {
      try {
        await task.run();
      } catch (error) {
        logger.warn("maintenance task failed", { task: task.name, error });
      }
    }
  };

  void runAll();
  const timer = setInterval(() => void runAll(), intervalMs);
  // Maintenance must never keep a process alive on its own.
  timer.unref?.();
  globalThis.__metacraftMaintenanceTimer = timer;
}

export function stopMaintenanceLoop(): void {
  if (globalThis.__metacraftMaintenanceTimer) {
    clearInterval(globalThis.__metacraftMaintenanceTimer);
    globalThis.__metacraftMaintenanceTimer = undefined;
  }
}
