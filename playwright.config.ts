import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end smoke tests against the local Supabase stack (`supabase start`)
 * on a phone-sized Chromium viewport. Locally this reuses `pnpm dev` if it's
 * already running; CI builds once and serves with `pnpm start`. The sign-in
 * code is read from Mailpit, the local stack's inbox.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: process.env.CI ? "pnpm start" : "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
