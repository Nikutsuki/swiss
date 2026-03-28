import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.MONOLITH_DROP_E2E_BASE_URL ?? "http://127.0.0.1:3002";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  webServer: {
    command: "pnpm run dev:http",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
