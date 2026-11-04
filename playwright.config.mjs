import { defineConfig } from "@playwright/test";

// Browser tests (tests/e2e). They need a MongoDB they may wipe: MONGODB_URI must point
// at a test database (CI starts one). Run: npm run build && npm run test:e2e
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /.*\.spec\.mjs/,
  globalSetup: "./tests/e2e/global-setup.mjs",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  webServer: {
    command: "npx next start -p 3100",
    url: "http://localhost:3100",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
