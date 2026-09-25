export class MissingDatabaseUrlError extends Error {
  constructor() {
    super("DATABASE_URL is not set. Export it or add it to .env (see .env.example).");
    this.name = "MissingDatabaseUrlError";
  }
}

/**
 * The Postgres connection string, which must come from the environment.
 * There is deliberately no built-in fallback: source code never carries a
 * connection string, and a missing value fails loudly instead of silently
 * connecting somewhere unintended.
 */
export function requireDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL;
  if (!url) {
    throw new MissingDatabaseUrlError();
  }
  return url;
}
