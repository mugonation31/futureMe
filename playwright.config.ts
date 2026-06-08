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
    {
      // Transactions + categories API smoke tests (no browser).
      // Run with: npx playwright test --project=transactions-api
      name: "transactions-api",
      testDir: "./e2e/specs/smoke",
      testMatch: ["**/transactions-api.spec.ts"],
      use: { baseURL: "http://localhost:8002" },
    },
    {
      // Transactions UI smoke tests (browser, mocked backend).
      // Requires the Angular dev server on http://localhost:4200.
      // Run with: npx playwright test --project=transactions-ui
      name: "transactions-ui",
      testDir: "./e2e/specs/smoke",
      testMatch: ["**/transactions-ui.spec.ts"],
      use: { baseURL: "http://localhost:4200" },
    },
    {
      // Password-reset API smoke tests (no browser).
      // Tests POST /api/auth/forgot-password and POST /api/auth/reset-password.
      // Run with: npx playwright test --project=password-reset-api
      name: "password-reset-api",
      testDir: "./e2e/specs/smoke",
      testMatch: ["**/password-reset-api.spec.ts"],
      use: { baseURL: "http://localhost:8002" },
    },
  ],
});
