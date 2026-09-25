import { execSync } from "node:child_process";

/**
 * Brings the target database's schema up to date before the web server starts,
 * so the suite also works against a freshly created database.
 */
export default function globalSetup(): void {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set to run the end-to-end suite (see README).");
  }
  execSync("npm run db:migrate", { stdio: "inherit", env: process.env });
}
