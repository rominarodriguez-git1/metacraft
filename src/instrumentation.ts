export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { loadEnv } = await import("@/lib/env");
  loadEnv();

  const [
    { db },
    { processDispatchJob },
    { reportResponse },
    { startDispatchWorker, pgBossDispatchQueue },
    { requeueStalePendingDispatches },
    { startMaintenanceLoop },
  ] = await Promise.all([
    import("@/db/client"),
    import("@/modules/dispatch/handler"),
    import("@/modules/dispatch/ingest"),
    import("@/modules/dispatch/pgboss-queue"),
    import("@/modules/dispatch/sweeper"),
    import("@/lib/maintenance"),
  ]);

  await startDispatchWorker((dispatchId) =>
    processDispatchJob(db, dispatchId, {
      reportResponse: (id, quote) => reportResponse(db, id, quote),
    }),
  );

  // Recovers dispatches whose queue job was never created or was lost.
  startMaintenanceLoop(
    [{ name: "requeue-stale-dispatches", run: () => requeueStalePendingDispatches(db, pgBossDispatchQueue) }],
    MAINTENANCE_INTERVAL_MS,
  );
}

const MAINTENANCE_INTERVAL_MS = 30_000;
