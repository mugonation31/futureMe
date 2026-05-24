import { defineConfig } from "@playwright/test";

/**
 * Playwright configuration for futureMe E2E tests.
 *
 * These tests run against the Docker Compose deployment:
 *   - Backend (FastAPI): http://localhost:8002
 *   - Frontend (Angular/nginx): http://localhost:4202
 *
 * Start Docker Compose before running tests:
 *   docker compose up -d --build
 *
 * Run tests:
 *   npx playwright test
 */
export default defineConfig({
  testDir: "./e2e/specs",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: "http://localhost:4202",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },

  projects: [
    {
      name: "ui",
      testDir: "./e2e/specs/smoke",
      testMatch: ["**/auth.spec.ts", "**/onboarding.spec.ts"],
    },
    {
      name: "api",
      testDir: "./e2e/specs/smoke",
      testMatch: ["**/household-api.spec.ts"],
      use: { baseURL: "http://localhost:8002" },
    },
  ],
});
