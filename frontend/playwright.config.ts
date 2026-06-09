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
  ],
});
