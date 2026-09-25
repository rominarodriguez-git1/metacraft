import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "@/db/schema";

const DEFAULT_DATABASE_URL = "postgres://metacraft:metacraft@localhost:5432/metacraft";
const MIGRATIONS_FOLDER = "./drizzle/migrations";

export function testDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

export interface TestDatabase {
  db: NodePgDatabase<typeof schema>;
  pool: Pool;
  schemaName: string;
  truncateAll: () => Promise<void>;
  close: () => Promise<void>;
}

/**
 * Creates a Postgres schema unique to the calling test file, runs the
 * Drizzle migrations into it, and returns helpers to truncate its tables
 * between tests and tear it down when the file's tests finish.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const schemaName = `test_${randomUUID().replace(/-/g, "_")}`;
  const connectionString = testDatabaseUrl();

  const adminPool = new Pool({ connectionString });
  try {
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
  } finally {
    await adminPool.end();
  }

  const pool = new Pool({
    connectionString,
    options: `-c search_path="${schemaName}"`,
  });
  const db = drizzle(pool, { schema });

  await migrate(db, {
    migrationsFolder: MIGRATIONS_FOLDER,
    migrationsSchema: schemaName,
  });

  async function truncateAll(): Promise<void> {
    const { rows } = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = $1 AND tablename NOT LIKE '__drizzle%'`,
      [schemaName],
    );
    for (const { tablename } of rows) {
      await pool.query(`TRUNCATE TABLE "${schemaName}"."${tablename}" CASCADE`);
    }
  }

  async function close(): Promise<void> {
    await pool.end();
    const cleanupPool = new Pool({ connectionString });
    try {
      await cleanupPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    } finally {
      await cleanupPool.end();
    }
  }

  return { db, pool, schemaName, truncateAll, close };
}
