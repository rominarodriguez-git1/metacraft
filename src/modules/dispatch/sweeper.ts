import { logger } from "@/lib/logger";
import type { DispatchQueue } from "@/modules/dispatch/queue-port";
import { findStalePendingDispatchIds, type RequestsDb } from "@/modules/requests/repository";

/** A pending dispatch older than this is assumed to have lost its queue job. */
export const STALE_PENDING_AFTER_MS = 30_000;

/**
 * Re-enqueues dispatches that are still `pending` well after creation: their
 * job was never created (the process died between commit and enqueue, or the
 * enqueue failed) or was lost. The queue deduplicates by dispatchId, so a
 * dispatch that still has a live job is not enqueued twice. One failed
 * enqueue does not stop the rest. Returns how many were (re)submitted.
 */
export async function requeueStalePendingDispatches(
  db: RequestsDb,
  queue: DispatchQueue,
  options: { olderThanMs?: number; now?: Date } = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - (options.olderThanMs ?? STALE_PENDING_AFTER_MS));
  const ids = await findStalePendingDispatchIds(db, cutoff);

  const results = await Promise.allSettled(ids.map((id) => queue.enqueueDispatch(id)));
  const failed = results.filter((result) => result.status === "rejected").length;
  if (failed > 0) {
    logger.warn("stale dispatch sweep: some enqueues failed", { failed, attempted: ids.length });
  }
  return ids.length - failed;
}
