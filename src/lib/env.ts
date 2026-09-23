import { z } from "zod";

export class MissingEnvVarsError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`Missing required environment variables: ${missing.join(", ")}`);
    this.name = "MissingEnvVarsError";
    this.missing = missing;
  }
}

const BETTER_AUTH_SECRET_MIN_LENGTH = 32;

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.string().min(1),
  EMAIL_FROM: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(BETTER_AUTH_SECRET_MIN_LENGTH),
  RESEND_API_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

const ALWAYS_REQUIRED_KEYS = [
  "DATABASE_URL",
  "SMTP_HOST",
  "SMTP_PORT",
  "EMAIL_FROM",
  "NEXT_PUBLIC_APP_URL",
  "BETTER_AUTH_SECRET",
] as const satisfies ReadonlyArray<keyof Env>;

export function loadEnv(source: Partial<Record<string, string>> = process.env): Env {
  const requiredKeys: Array<keyof Env> =
    source.NODE_ENV === "production" ? [...ALWAYS_REQUIRED_KEYS, "RESEND_API_KEY"] : [...ALWAYS_REQUIRED_KEYS];

  const missing = requiredKeys.filter((key) => {
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
