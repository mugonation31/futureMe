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
      // Password-reset API smoke tests (no browser).
      // Tests POST /api/auth/forgot-password and POST /api/auth/reset-password.
      // Run with: npx playwright test --project=password-reset-api
      name: "password-reset-api",
      testDir: "./e2e/specs/smoke",
      testMatch: ["**/password-reset-api.spec.ts"],
      use: { baseURL: "http://localhost:8002" },
    },
    {
      // Task 23 — income-stream CRUD API smoke tests (no browser).
      // Covers POST/PATCH/DELETE /api/budget/{budget_id}/income:
      // happy-path CRUD, validation (422), ownership isolation (404), and auth.
      // Each test registers its own fresh user, so no seeded tokens are needed.
      //
      // REQUIRES: Docker Compose running with current backend code
      //   (docker compose up -d --build). A stale pre-Task-23 image causes the
      //   suite to skip automatically.
      //
      // Run only this project with:
      //   npx playwright test --project=income-api
      name: "income-api",
      testDir: "./e2e/specs/smoke",
      testMatch: ["**/income-api.spec.ts"],
      use: { baseURL: "http://localhost:8002" },
    },
    {
      // SEC-4: CORS tightening API smoke tests (no browser).
      // Verifies preflight/simple-request CORS header behaviour using Node fetch.
      // Run with: npx playwright test --project=cors-api
      name: "cors-api",
      testDir: "./e2e/specs/smoke",
      testMatch: ["**/cors-api.spec.ts"],
      use: { baseURL: "http://localhost:8002" },
    },
    {
      // Task 12 — monthly expenses dashboard tests.
      // Verifies that recurring expenses from prior months and current-month
      // non-recurring expenses are correctly summed in total_expenses, and that
      // the dashboard Net Position card reflects the correct value.
      //
      // REQUIRES: Docker Compose running (backend on 8002, frontend on 4202).
      // Tests are skipped automatically when the backend is unreachable.
      //
      // Run only this project with:
      //   npx playwright test --project=monthly-expenses
      name: "monthly-expenses",
      testDir: "./e2e/specs/dashboard",
      testMatch: ["**/monthly-expenses.spec.ts"],
      use: { baseURL: "http://localhost:4202" },
    },
    {
      // Task 12 (DB migration) — debt balance immutability and CRUD regression.
      // Verifies that DebtUpdate no longer accepts `balance`, that existing
      // debt CRUD continues to work after the model change, and that savings-goal
      // CRUD is unaffected by the two new nullable columns added to savings_goals.
      //
      // REQUIRES: Docker Compose running (backend on 8002).
      // Tests are skipped automatically when the backend is unreachable.
      //
      // Run only this project with:
      //   npx playwright test --project=debt-regression
      name: "debt-regression",
      testDir: "./e2e/specs/debts",
      testMatch: ["**/debt-balance-immutability.spec.ts"],
      use: { baseURL: "http://localhost:8002" },
    },
    {
      // Task 13 — debt derived-balance E2E tests.
      // Verifies that POST /api/debts returns starting_balance equal to the
      // submitted balance, that GET /api/debts exposes derived balances,
      // that PATCH /api/debts/{id} rejects `balance` with 422, and that
      // GET /api/dashboard debt_summary.total_owed aggregates derived balances.
      //
      // REQUIRES: Docker Compose running (backend on 8002).
      // Tests are skipped automatically when the backend is unreachable.
      //
      // Run only this project with:
      //   npx playwright test --project=debt-derived-balance
      name: "debt-derived-balance",
      testDir: "./e2e/specs/debts",
      testMatch: ["**/debt-derived-balance.spec.ts"],
      use: { baseURL: "http://localhost:8002" },
    },
  ],
});
