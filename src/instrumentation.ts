export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const [{ db }, { processDispatchJob }, { reportResponse }, { startDispatchWorker }] = await Promise.all([
    import("@/db/client"),
    import("@/modules/dispatch/handler"),
    import("@/modules/dispatch/ingest"),
    import("@/modules/dispatch/pgboss-queue"),
  ]);

  await startDispatchWorker((dispatchId) =>
    processDispatchJob(db, dispatchId, {
      reportResponse: (id, quote) => reportResponse(db, id, quote),
    }),
  );
}
