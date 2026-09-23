import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

const DEFAULT_DATABASE_URL = "postgres://metacraft:metacraft@localhost:5432/metacraft";

export function createDbClient(connectionString: string = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL): {
  pool: Pool;
  db: NodePgDatabase<typeof schema>;
} {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { pool, db };
}

const client = createDbClient();

export const pool = client.pool;
export const db = client.db;
