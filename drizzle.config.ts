import { defineConfig } from "drizzle-kit";

const DEFAULT_DATABASE_URL = "postgres://metacraft:metacraft@localhost:5432/metacraft";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  },
});
