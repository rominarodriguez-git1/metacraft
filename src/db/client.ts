import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";
import { requireDatabaseUrl } from "@/db/database-url";

export function createDbClient(connectionString: string = requireDatabaseUrl()): {
  pool: Pool;
  db: NodePgDatabase<typeof schema>;
} {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { pool, db };
}

let client: ReturnType<typeof createDbClient> | undefined;

function getClient(): ReturnType<typeof createDbClient> {
  client ??= createDbClient();
  return client;
}

/**
 * The shared Drizzle client, created on first use rather than at import, so
 * that importing a route module (as `next build` does while collecting page
 * data) never requires DATABASE_URL. The first actual query does, and throws
 * MissingDatabaseUrlError when it is not set.
 */
export const db: NodePgDatabase<typeof schema> = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, property) {
    const real = getClient().db;
    const value = Reflect.get(real, property, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
