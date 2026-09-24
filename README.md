# metacraft

A quote aggregator for renovation work. You describe the job once, pick providers from several sources, send one quote request to all of them, and follow each request's status in one place. The MVP uses three **simulated** provider sources behind the same adapter interface that real platforms would use later.

## Stack

Next.js (App Router) and TypeScript, PostgreSQL with Drizzle, pg-boss for background dispatch, Better Auth (email magic link), next-intl (Spanish and English), Vitest and Playwright.

## Prerequisites

- Node.js 22 (see `.nvmrc`) with npm
- Docker, for local Postgres and Mailpit

## Local setup

1. Install dependencies:

   ```sh
   npm ci
   ```

2. Start Postgres and Mailpit (Mailpit catches outgoing email; its inbox is at http://localhost:8025):

   ```sh
   docker compose up -d --wait
   ```

3. Create your environment file and fill in a secret:

   ```sh
   cp .env.example .env
   openssl rand -base64 32   # paste the output as BETTER_AUTH_SECRET in .env
   ```

   Keep `EMAIL_PROVIDER=smtp` locally so sign-in links go to Mailpit. Production uses `EMAIL_PROVIDER=resend` with `RESEND_API_KEY`.

4. Apply database migrations:

   ```sh
   npm run db:migrate
   ```

5. Run the app at http://localhost:3000:

   ```sh
   npm run dev
   ```

   Sign in with any email address, then open the link that arrives in Mailpit.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `EMAIL_PROVIDER` | yes | `smtp` (Mailpit) or `resend` |
| `SMTP_HOST`, `SMTP_PORT` | when `EMAIL_PROVIDER=smtp` | SMTP server for outgoing email |
| `RESEND_API_KEY` | when `EMAIL_PROVIDER=resend` | Resend API key |
| `EMAIL_FROM` | yes | Sender address for magic-link email |
| `NEXT_PUBLIC_APP_URL` | yes | Public base URL, used to build sign-in links |
| `BETTER_AUTH_SECRET` | yes, 32+ characters | Signs sessions and tokens; generate it, never commit it |
| `SIM_ADAPTER_CONFIG` | no | JSON overrides for the simulated sources' behaviour (see `.env.example`) |
| `PGBOSS_SCHEMA` | no | pg-boss schema name, default `pgboss` |

The server validates its environment at startup and refuses to start if a required variable is missing, naming the variable but never printing its value.

## Tests

```sh
npm run lint              # ESLint, including the import-boundary rules
npm run typecheck         # tsc --noEmit
npm test                  # unit tests
npm run test:integration  # integration tests (needs the docker compose Postgres)
```

### End-to-end tests

The end-to-end suite builds and starts the production app, then drives the full flow in Chromium at a 360 px phone width and a 1280 px desktop width: sign in through Mailpit, search, filter, send a request to three providers, check the mixed failed / responded / sent statuses, and switch language.

```sh
npx playwright install chromium   # once per machine
npm run test:e2e
```

It needs the docker compose services running and these variables in the shell: `DATABASE_URL`, `SMTP_HOST`, `SMTP_PORT`, `EMAIL_FROM` and `BETTER_AUTH_SECRET`. The suite applies migrations itself and pins the simulated sources' behaviour through `SIM_ADAPTER_CONFIG`. Port 3000 must be free, because the suite never reuses a running server. Tests run one at a time. Signing in more than about five times a minute from one machine trips the auth rate limit, so avoid rapid repeated runs.

## Project layout

- `src/app` — pages and API routes (the composition point that wires real infrastructure)
- `src/modules/auth` — magic-link auth, sessions, rate limiting, mailer
- `src/modules/catalog` — provider search across all sources
- `src/modules/requests` — quote requests, idempotency, the dispatch state machine
- `src/modules/dispatch` — the dispatch queue port and its pg-boss implementation
- `src/modules/providers` — the provider adapter interface, the registry and the simulated sources
- `src/lib` — environment validation, the redacting logger
- `tests/unit`, `tests/integration`, `tests/e2e` — the three test layers
