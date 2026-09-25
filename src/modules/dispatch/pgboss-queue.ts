import { PgBoss } from "pg-boss";
import { logger } from "@/lib/logger";
import type { DispatchQueue } from "@/modules/dispatch/queue-port";

const DEFAULT_DATABASE_URL = "postgres://metacraft:metacraft@localhost:5432/metacraft";
// The "exclusive" policy keeps at most one created/retry/active job per
// singletonKey, and every job is keyed by its dispatchId. Re-enqueueing a
// dispatch (the stale-dispatch sweeper, a retried submit) therefore never
// creates a second live job, so an adapter is never called twice concurrently
// for one dispatch. A queue's policy cannot be changed after creation, hence a
// new name. The older "dispatch" queue only ever existed in local databases.
export const DISPATCH_QUEUE_NAME = "dispatch-exclusive";
const QUEUE_NAME = DISPATCH_QUEUE_NAME;

// pg-boss defaults (one job per worker, a 2s idle poll) processed roughly one
// dispatch every two seconds. Several single-job workers keep per-job failure
// isolation (a throwing job only fails itself) while running dispatches in
// parallel, and NOTIFY plus a short poll picks new jobs up promptly.
//
// notifyPollingIntervalSeconds matters: with NOTIFY active pg-boss otherwise
// relaxes its fallback poll to 30s, and a burst that arrives while every worker
// is busy misses its wake-up, leaving the overflow waiting up to 30s.
export const DISPATCH_WORK_OPTIONS = {
  localConcurrency: 5,
  pollingIntervalSeconds: 0.5,
  notifyPollingIntervalSeconds: 0.5,
  batchSize: 1,
} as const;

function pgBossSchema(): string {
  return process.env.PGBOSS_SCHEMA ?? "pgboss";
}

interface DispatchJobData {
  dispatchId: string;
}

declare global {
  var __metacraftDispatchWorkerStarted: Promise<void> | undefined;
}

let bossSingleton: PgBoss | undefined;

function getBoss(): PgBoss {
  if (!bossSingleton) {
    const connectionString = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
    bossSingleton = new PgBoss({ connectionString, schema: pgBossSchema(), useListenNotify: true });
    bossSingleton.on("error", (error: unknown) => {
      logger.error("pg-boss error", { error });
    });
  }
  return bossSingleton;
}

const preparedBosses = new WeakSet<PgBoss>();

/**
 * Starts the instance and makes sure the dispatch queue exists with NOTIFY on.
 * updateQueue also switches NOTIFY on for a queue created before it was
 * enabled, since createQueue leaves an existing queue's options unchanged.
 */
async function prepareBoss(boss: PgBoss): Promise<void> {
  await boss.start();
  if (preparedBosses.has(boss)) {
    return;
  }
  await boss.createQueue(QUEUE_NAME, { notify: true, policy: "exclusive" });
  await boss.updateQueue(QUEUE_NAME, { notify: true });
  preparedBosses.add(boss);
}

export function createPgBossDispatchQueue(bossOverride?: PgBoss): DispatchQueue {
  return {
    async enqueueDispatch(dispatchId: string): Promise<void> {
      const boss = bossOverride ?? getBoss();
      await prepareBoss(boss);
      await boss.send(QUEUE_NAME, { dispatchId } satisfies DispatchJobData, { singletonKey: dispatchId });
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
 *
 * The guard holds the in-flight start promise rather than a boolean: callers
 * that arrive concurrently share one registration, and a start that fails
 * (for example pg-boss cannot reach the database) clears the guard, so a later
 * call can retry instead of the process silently running with no worker.
 */
export function startDispatchWorker(
  handler: (dispatchId: string) => Promise<void>,
  bossOverride?: PgBoss,
): Promise<void> {
  const inFlight = globalThis.__metacraftDispatchWorkerStarted;
  if (inFlight) {
    return inFlight;
  }

  const start = (async () => {
    const boss = bossOverride ?? getBoss();
    await prepareBoss(boss);
    await boss.work<DispatchJobData>(QUEUE_NAME, DISPATCH_WORK_OPTIONS, async (jobs) => {
      for (const job of jobs) {
        await handler(job.data.dispatchId);
      }
    });
  })();

  globalThis.__metacraftDispatchWorkerStarted = start;
  start.catch(() => {
    if (globalThis.__metacraftDispatchWorkerStarted === start) {
      globalThis.__metacraftDispatchWorkerStarted = undefined;
    }
  });
  return start;
}
