import { Pool } from "pg";
import { testDatabaseUrl } from "../helpers/db";

/**
 * Vitest globalSetup: fails the whole run up front with a clear message if
 * the docker-compose Postgres isn't reachable, instead of letting every
 * integration test time out individually.
 */
export default async function globalSetup(): Promise<void> {
  const connectionString = testDatabaseUrl();
  const pool = new Pool({ connectionString });
  try {
    await pool.query("SELECT 1");
  } catch (error) {
    throw new Error(
      `Cannot reach the test Postgres database at ${connectionString.replace(/:[^:@]*@/, ":[REDACTED]@")}. ` +
        "Start it with `docker compose up -d postgres` before running tests.",
      { cause: error },
    );
  } finally {
    await pool.end();
  }
}
