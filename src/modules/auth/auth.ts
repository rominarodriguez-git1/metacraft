import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { magicLink } from "better-auth/plugins/magic-link";
import { nextCookies } from "better-auth/next-js";
import { APIError, createAuthMiddleware, getIP } from "better-auth/api";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { db as defaultDb } from "@/db/client";
import * as schema from "@/db/schema";
import { logger as appLogger, type LogFields } from "@/lib/logger";
import { createMailer, type Mailer } from "@/modules/auth/mailer";
import { enforceMagicLinkRateLimit, RateLimitExceededError } from "@/modules/auth/rate-limit";

const MAGIC_LINK_SEND_PATH = "/sign-in/magic-link";
const DEFAULT_BASE_URL = "http://localhost:3000";

export interface CreateAuthOptions {
  db: NodePgDatabase<typeof schema>;
  mailer?: Mailer;
  baseURL?: string;
}

export function createAuth({ db, mailer = createMailer(), baseURL }: CreateAuthOptions) {
  return betterAuth({
    baseURL: baseURL ?? process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_BASE_URL,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    logger: {
      // Magic-link flows carry PII (email, token) in their debug/info logs by
      // design; only forward error-level framework diagnostics so the app
      // logger's redaction is the sole thing standing between a framework log
      // line and a raw email/token, never a verbosity setting.
      level: "error",
      log(level, message, ...args) {
        const fields: LogFields | undefined = args.length > 0 ? { args } : undefined;
        switch (level) {
          case "debug":
            appLogger.debug(message, fields);
            break;
          case "warn":
            appLogger.warn(message, fields);
            break;
          case "error":
            appLogger.error(message, fields);
            break;
          default:
            appLogger.info(message, fields);
        }
      },
    },
    plugins: [
      magicLink({
        expiresIn: 900,
        storeToken: "hashed",
        disableSignUp: false,
        async sendMagicLink({ email, url }) {
          await mailer.sendMagicLink({ to: email, url });
        },
      }),
      // Must stay last: applies the session cookie via Next's server cookie API.
      nextCookies(),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== MAGIC_LINK_SEND_PATH) {
          return;
        }

        const email = typeof ctx.body?.email === "string" ? ctx.body.email : undefined;
        if (!email) {
          return;
        }

        const ip = getIP(ctx.request ?? ctx.headers ?? new Headers(), ctx.context.options) ?? "127.0.0.1";

        try {
          await enforceMagicLinkRateLimit(db, { email, ip });
        } catch (error) {
          if (error instanceof RateLimitExceededError) {
            throw new APIError("TOO_MANY_REQUESTS", {
              message: "Too many requests. Please try again later.",
              code: "RATE_LIMITED",
            });
          }
          throw error;
        }
      }),
    },
  });
}

export const auth = createAuth({ db: defaultDb });
