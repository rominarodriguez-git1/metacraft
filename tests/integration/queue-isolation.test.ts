import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDatabaseUrl } from "../helpers/db";

const REPO_ROOT = path.resolve(__dirname, "../..");

async function pgbossJobCount(pool: Pool, schemaName: string): Promise<number> {
  try {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "${schemaName}".job`,
    );
    return Number(rows[0]?.count ?? 0);
  } catch {
    // The schema (or its job table) doesn't exist yet, so there is nothing in it.
    return 0;
  }
}

describe("dispatch queue schema isolation", () => {
  const schemaName = `test_pgboss_${randomUUID().replace(/-/g, "_")}`;
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: testDatabaseUrl() });
  });

  afterAll(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await pool.end();
  });

  it("enqueues into the schema named by PGBOSS_SCHEMA, not the shared pgboss schema", async () => {
    process.env.PGBOSS_SCHEMA = schemaName;
    const { createPgBossDispatchQueue } = await import("@/modules/dispatch/pgboss-queue");
    const queue = createPgBossDispatchQueue();

    const dispatchId = randomUUID();
    try {
      await queue.enqueueDispatch(dispatchId);
    } finally {
      delete process.env.PGBOSS_SCHEMA;
    }

    const isolatedCount = await pgbossJobCount(pool, schemaName);
    expect(isolatedCount).toBe(1);

    // On a fresh database the shared pgboss schema may never have been created,
    // which already proves the job did not land there; when it exists, the job
    // must not be in it.
    const { rows: sharedTable } = await pool.query<{ exists: boolean }>(
      `SELECT to_regclass('pgboss.job') IS NOT NULL AS exists`,
    );
    if (sharedTable[0]?.exists) {
      const sharedRows = await pool.query(
        `SELECT 1 FROM pgboss.job WHERE data->>'dispatchId' = $1`,
        [dispatchId],
      );
      expect(sharedRows.rowCount).toBe(0);
    } else {
      expect(sharedTable[0]?.exists).toBe(false);
    }
  });

  it("leaves the row count of pgboss.job unchanged after the requests and requests-authz suites run", async () => {
    const before = await pgbossJobCount(pool, "pgboss");

    const result = spawnSync(
      "npx",
      [
        "vitest",
        "run",
        "--config",
        "vitest.integration.config.ts",
        "tests/integration/requests.test.ts",
        "tests/integration/requests-authz.test.ts",
      ],
      { cwd: REPO_ROOT, stdio: "pipe", env: process.env },
    );

    expect(result.status).toBe(0);

    const after = await pgbossJobCount(pool, "pgboss");
    expect(after).toBe(before);
  }, 60000);
});
