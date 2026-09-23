import { PgBoss } from "pg-boss";
import { logger } from "@/lib/logger";
import type { DispatchQueue } from "@/modules/dispatch/queue-port";

const DEFAULT_DATABASE_URL = "postgres://metacraft:metacraft@localhost:5432/metacraft";
const QUEUE_NAME = "dispatch";

interface DispatchJobData {
  dispatchId: string;
}

declare global {
  var __metacraftDispatchWorkerStarted: boolean | undefined;
}

let bossSingleton: PgBoss | undefined;

function getBoss(): PgBoss {
  if (!bossSingleton) {
    const connectionString = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
    bossSingleton = new PgBoss(connectionString);
    bossSingleton.on("error", (error: unknown) => {
      logger.error("pg-boss error", { error });
    });
  }
  return bossSingleton;
}

export function createPgBossDispatchQueue(bossOverride?: PgBoss): DispatchQueue {
  return {
    async enqueueDispatch(dispatchId: string): Promise<void> {
      const boss = bossOverride ?? getBoss();
      await boss.start();
      await boss.createQueue(QUEUE_NAME);
      await boss.send(QUEUE_NAME, { dispatchId } satisfies DispatchJobData);
    },
  };
}

export const pgBossDispatchQueue: DispatchQueue = createPgBossDispatchQueue();

/**
 * Registers the pg-boss worker for the dispatch queue. Guarded by a
 * globalThis flag (rather than a module-local one) so that Next.js
 * instrumentation.ts's register() hook, which the runtime may invoke more
 * than once per process, only ever registers the boss.work handler a single
 * time.
 */
export async function startDispatchWorker(
  handler: (dispatchId: string) => Promise<void>,
  bossOverride?: PgBoss,
): Promise<void> {
  if (globalThis.__metacraftDispatchWorkerStarted) {
    return;
  }
  globalThis.__metacraftDispatchWorkerStarted = true;

  const boss = bossOverride ?? getBoss();
  await boss.start();
  await boss.createQueue(QUEUE_NAME);
  await boss.work<DispatchJobData>(QUEUE_NAME, async (jobs) => {
    for (const job of jobs) {
      await handler(job.data.dispatchId);
    }
  });
}
