import { defineConfig, devices } from "@playwright/test";

const BASE_URL = "http://localhost:3000";

// Deterministic simulated-source behaviour for the end-to-end flow: obrafacil
// always fails, reformasya always responds quickly, casapro never responds (so
// its dispatch stays "sent"). Seeds are left at their defaults so the catalogs
// match the ones the search assertions rely on.
const E2E_SIM_ADAPTER_CONFIG = JSON.stringify({
  obrafacil: { failureRate: 1, latencyMsRange: { min: 50, max: 150 } },
  reformasya: {
    failureRate: 0,
    responseRate: 1,
    latencyMsRange: { min: 50, max: 150 },
    responseDelayMsRange: { min: 300, max: 800 },
  },
  casapro: { failureRate: 0, responseRate: 0, latencyMsRange: { min: 50, max: 150 } },
});

const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // One test at a time: every test shares a single server, database, Mailpit
  // inbox and the auth rate limits, so parallel runs only add contention.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }], ["list"]],
  outputDir: "test-results",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile-360",
      use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 740 } },
    },
    {
      name: "desktop-1280",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: BASE_URL,
    // Never reuse a server started elsewhere: it would not carry the
    // deterministic simulated-source configuration above.
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      ...inheritedEnv,
      NEXT_PUBLIC_APP_URL: BASE_URL,
      EMAIL_PROVIDER: "smtp",
      SIM_ADAPTER_CONFIG: E2E_SIM_ADAPTER_CONFIG,
    },
  },
});
