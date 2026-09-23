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
  EMAIL_PROVIDER: z.enum(["smtp", "resend"]),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(BETTER_AUTH_SECRET_MIN_LENGTH),
  RESEND_API_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

const ALWAYS_REQUIRED_KEYS = [
  "DATABASE_URL",
  "EMAIL_PROVIDER",
  "EMAIL_FROM",
  "NEXT_PUBLIC_APP_URL",
  "BETTER_AUTH_SECRET",
] as const satisfies ReadonlyArray<keyof Env>;

const PROVIDER_REQUIRED_KEYS = {
  smtp: ["SMTP_HOST", "SMTP_PORT"],
  resend: ["RESEND_API_KEY"],
} as const satisfies Record<"smtp" | "resend", ReadonlyArray<keyof Env>>;

export function loadEnv(source: Partial<Record<string, string>> = process.env): Env {
  const missing = ALWAYS_REQUIRED_KEYS.filter((key) => {
    const value = source[key];
    return value === undefined || value === "";
  });

  if (missing.length > 0) {
    throw new MissingEnvVarsError(missing);
  }

  const provider = source.EMAIL_PROVIDER;
  if (provider !== "smtp" && provider !== "resend") {
    throw new MissingEnvVarsError(["EMAIL_PROVIDER"]);
  }

  const providerMissing = PROVIDER_REQUIRED_KEYS[provider].filter((key) => {
    const value = source[key];
    return value === undefined || value === "";
  });

  if (providerMissing.length > 0) {
    throw new MissingEnvVarsError(providerMissing);
  }

  const result = envSchema.safeParse(source);
  if (!result.success) {
    const invalidKeys = result.error.issues.map((issue) => String(issue.path[0]));
    throw new MissingEnvVarsError(invalidKeys);
  }

  return result.data;
}
