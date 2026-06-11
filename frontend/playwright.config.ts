import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// Load E2E-specific env vars from frontend/e2e/.env
// Using a manual loader because dotenv is not a listed devDependency.
const envPath = path.resolve(__dirname, 'e2e', '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
}

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env['E2E_BASE_URL'] || 'http://localhost:4201',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    /**
     * auth-pages project
     * ------------------
     * Covers the landing page (/), login page (/login), and signup page (/signup).
     * These are all public routes that require no authentication.
     *
     * The Angular dev server must be running on the port declared in
     * AUTH_PAGES_BASE_URL (default: http://localhost:4200).  Start it with:
     *   cd frontend && ng serve           # default port 4200
     *   cd frontend && ng serve --port 4202  # if you want the same port as CI
     *
     * Run only this project with:
     *   npx playwright test --project=auth-pages
     */
    {
      name: 'auth-pages',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env['AUTH_PAGES_BASE_URL'] || 'http://localhost:4200',
      },
      testMatch: ['**/smoke/auth-pages.spec.ts', '**/smoke/password-reset.spec.ts'],
    },

    /**
     * dashboard project
     * -----------------
     * Covers Tasks 27 (spending data / category breakdown) and 29 (currency pipe).
     * All API calls are mocked via page.route() — no live backend required.
     * The Angular dev server must be running on E2E_BASE_URL (default: 4201).
     *
     * Run only this project with:
     *   npx playwright test --project=dashboard
     */
    {
      name: 'dashboard',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ['**/dashboard/dashboard.spec.ts'],
    },

    /**
     * settings project
     * ----------------
     * Covers Tasks 28 (settings polish — success auto-dismiss, blank display_name)
     * and 29 (currency change reflected on dashboard).
     * All API calls are mocked via page.route() — no live backend required.
     * The Angular dev server must be running on E2E_BASE_URL (default: 4201).
     *
     * Run only this project with:
     *   npx playwright test --project=settings
     */
    {
      name: 'settings',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ['**/settings/settings.spec.ts'],
    },

    /**
     * token-refresh project (SEC-1)
     * ------------------------------
     * Covers the JWT silent-refresh flow:
     *   1. Login stores both fm_access_token and fm_refresh_token
     *   2. Expired access token → interceptor refreshes silently, user stays on /dashboard
     *   3. Logout clears both tokens from localStorage
     *   4. Invalid refresh token → interceptor calls logout() + redirects to /login
     *
     * All API calls are mocked via page.route() — no live backend required.
     * The Angular dev server must be running on E2E_BASE_URL (default: 4202).
     *
     * Run only this project with:
     *   npx playwright test --project=token-refresh
     */
    {
      name: 'token-refresh',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ['**/auth/token-refresh.spec.ts'],
    },

    /**
     * password-ux project (SEC-2)
     * ----------------------------
     * Covers password complexity validation and show/hide toggle UX across all
     * three auth routes that contain password fields:
     *
     *   /login           — single password field with a show/hide toggle
     *   /signup          — two independent toggles, password-rules hint list,
     *                      and client-side complexity validation on submit
     *   /reset-password  — two independent toggles and password-rules hint list
     *
     * All tests are pure DOM-interaction checks or client-side validation checks.
     * No network requests are issued — no live backend is required.
     * The Angular dev server must be running on AUTH_PAGES_BASE_URL (default: 4200).
     *
     * Run only this project with:
     *   npx playwright test --project=password-ux
     */
    {
      name: 'password-ux',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env['AUTH_PAGES_BASE_URL'] || 'http://localhost:4200',
      },
      testMatch: ['**/auth/password-ux.spec.ts'],
    },

    /**
     * signup project
     * ---------------
     * Covers the sign-up form changes that split the old "Full Name" input into
     * separate "First Name" and "Last Name" inputs.
     *
     * Test groups:
     *   1. Form structure — First Name + Last Name present, Full Name absent
     *   2. First Name validation — empty / whitespace shows inline error
     *   3. Last Name validation  — empty / whitespace shows inline error
     *   4. Successful registration — mocked POST /api/auth/register, redirect to
     *      /onboarding, request body uses first_name / last_name
     *
     * Tests 1–3 are pure client-side validation checks (no API calls).
     * Test 4 mocks POST /api/auth/register via page.route() — no live backend
     * required.
     *
     * The Angular dev server must be running on AUTH_PAGES_BASE_URL (default: 4200).
     *
     * Run only this project with:
     *   npx playwright test --project=signup
     */
    {
      name: 'signup',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env['AUTH_PAGES_BASE_URL'] || 'http://localhost:4200',
      },
      testMatch: ['**/auth/signup.spec.ts'],
    },

    /**
     * budget-allocation-settings project (Task 33)
     * ----------------------------------------------
     * Covers the BudgetAllocationComponent embedded in the /settings page.
     *
     * Test groups:
     *   1. Panel rendering — panel is visible below the existing settings form
     *   2. Categories load — rows show category names with pre-filled limits
     *   3. Save fires PUT  — changing a value and saving sends PUT
     *   4. Save fires DELETE — clearing a pre-filled value sends DELETE
     *   5. Unchanged rows skipped — no API call when nothing changed
     *   6. Invalid input validation — error shown before any API call
     *   7. 403 error — owner-only error message displayed
     *   8. Loading state — loading message shown while forkJoin is in flight
     *
     * All API calls are mocked via page.route() — no live backend required.
     * The Angular dev server must be running on E2E_BASE_URL (default: 4202).
     *
     * Run only this project with:
     *   npx playwright test --project=budget-allocation-settings
     */
    {
      name: 'budget-allocation-settings',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ['**/settings/budget-allocation.spec.ts'],
    },

    /**
     * category-breakdown project (Task 34)
     * ---------------------------------------
     * Covers the "Spending by Category" section added in Task 34:
     *
     *   1. Category rows render — names and spent amounts visible
     *   2. Progress bar fill width — [style.width.%] matches spent/budget ratio,
     *      including 0% when budget is null or 0, and cap at 100%
     *   3. over-budget class — applied when spent >= 90% of budget; absent otherwise
     *   4. "No limit" text — shown when budget is null; formatted amount when set
     *   5. Empty-state card — shown when category_breakdown is empty; hidden otherwise
     *   6. No-household user — zeroed stats render without crash
     *
     * All API calls are mocked via page.route() — no live backend required.
     * The Angular dev server must be running on E2E_BASE_URL (default: 4202).
     *
     * Run only this project with:
     *   npx playwright test --project=category-breakdown
     */
    {
      name: 'category-breakdown',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ['**/dashboard/category-breakdown.spec.ts'],
    },

    /**
     * category-budgets project (Task 32)
     * ------------------------------------
     * Covers the three category-budget API endpoints added in Task 32:
     *
     *   GET    /api/category-budgets              — list budgets for household
     *   PUT    /api/category-budgets              — upsert monthly limit (owner only)
     *   DELETE /api/category-budgets/{categoryId} — remove budget (owner only, 204)
     *
     * Test groups:
     *   1. GET mocked — empty array, correct JSON shape, 403 without household
     *   2. PUT mocked — upserted budget shape, 403 non-owner, 404 unknown category,
     *                   422 invalid monthly_limit
     *   3. DELETE mocked — 204 success, 403 non-owner, 404 unknown budget
     *   4. Live GET  — 200 array, 401 unauthenticated, shape validation
     *                  (skipped when E2E_LIVE_API_URL is absent)
     *   5. Live PUT  — 200 upsert, idempotent upsert, 403/404/422/401 error cases
     *                  (skipped when E2E_LIVE_API_URL is absent)
     *   6. Live DELETE — 204, post-delete GET verifies removal, 404/403/401/422
     *                    (skipped when E2E_LIVE_API_URL is absent)
     *
     * Mocked tests use page.route() — no live backend is required.
     * Live tests require E2E_LIVE_API_URL, E2E_LIVE_TOKEN, E2E_LIVE_CATEGORY_ID.
     * The Angular dev server must be running on E2E_BASE_URL (default: 4202).
     *
     * Run only this project with:
     *   npx playwright test --project=category-budgets
     */
    {
      name: 'category-budgets',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ['**/dashboard/category-budgets.spec.ts'],
    },
  ],
});
