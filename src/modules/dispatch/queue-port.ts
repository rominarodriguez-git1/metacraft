/**
 * Core-owned port for enqueuing asynchronous dispatch processing. The only
 * concrete implementation (pg-boss) lives in pgboss-queue.ts; every other
 * module must depend on this interface instead, enforced by the
 * no-pgboss-imports-outside-queue-module dependency-cruiser rule.
 */
export interface DispatchQueue {
  enqueueDispatch(dispatchId: string): Promise<void>;
}
