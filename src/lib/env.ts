import { z } from "zod";

export class MissingEnvVarsError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`Missing required environment variables: ${missing.join(", ")}`);
    this.name = "MissingEnvVarsError";
    this.missing = missing;
  }
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.string().min(1),
  EMAIL_FROM: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

const REQUIRED_KEYS = Object.keys(envSchema.shape) as Array<keyof Env>;

export function loadEnv(source: Partial<Record<string, string>> = process.env): Env {
  const missing = REQUIRED_KEYS.filter((key) => {
    const value = source[key];
    return value === undefined || value === "";
  });

  if (missing.length > 0) {
    throw new MissingEnvVarsError(missing);
  }

  const result = envSchema.safeParse(source);
  if (!result.success) {
    const invalidKeys = result.error.issues.map((issue) => String(issue.path[0]));
    throw new MissingEnvVarsError(invalidKeys);
  }

  return result.data;
}
