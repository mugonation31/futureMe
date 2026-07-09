import { test, expect } from '@playwright/test';
import { SettingsPage } from '../../pages/settings.page';
import { seedAuthToken, buildFakeJwt, clearSession } from '../../utils/auth';

/**
 * Settings E2E tests — Tasks 28 (settings polish) and 29 (currency-aware pipe)
 * =============================================================================
 *
 * All tests mock the FastAPI backend via Playwright's page.route().
 * No live backend is required.
 *
 * The Angular authGuard checks for a JWT in localStorage ("fm_access_token").
 * We inject a structurally-valid, unsigned token via seedAuthToken() to satisfy
 * the guard without a real login.  The householdGuard calls GET /api/households/me,
 * which we also stub.
 *
 * Test groups
 * -----------
 * 1. Static rendering — the /settings page renders all fields
 * 2. Success message auto-dismiss — disappears after ~3 s (task 28)
 * 3. Blank display_name — does not overwrite the existing value (task 28)
 * 4. (RETIRED) Currency-change-reflected-on-dashboard — the money-era dashboard
 *    was removed in Task 27; this group is now a retired-note placeholder only.
 * 5. Auth guard — visiting /settings without a JWT redirects to /login
 *
 * Port: 4202 (configured in frontend/e2e/.env → E2E_BASE_URL).
 */

// ─── shared constants ────────────────────────────────────────────────────────

// The Angular app reads environment.apiUrl = 'http://localhost:8002/api'.
// E2E_API_URL must match that exactly for page.route() intercepts to fire.
const apiUrl = process.env['E2E_API_URL'] ?? 'http://localhost:8002/api';

const MOCK_HOUSEHOLD = {
  id: 'hh-e2e',
  name: 'E2E Household',
  invite_code: 'TEST-CODE',
};

/** Inject a fake JWT + stub households/me so protected routes are reachable. */
async function stubAuth(page: import('@playwright/test').Page): Promise<void> {
  const token = buildFakeJwt({ email: 'e2e@example.com' });
  await page.goto('/');
  await seedAuthToken(page, token);

  await page.route(`${apiUrl}/households/me`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_HOUSEHOLD),
    })
  );
}

// ─── 1. Static rendering ──────────────────────────────────────────────────────

test.describe('Settings page — static rendering', () => {
  test.beforeEach(async ({ page }) => {
    await stubAuth(page);

    // Stub GET /api/settings so the form is pre-populated.
    await page.route(`${apiUrl}/settings`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          display_name: 'Alice',
          currency: 'GBP',
          monthly_budget: 2000,
        }),
      })
    );
  });

  test('settings page heading is visible', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();

    await expect(settings.heading).toBeVisible();
  });

  test('display name input is visible and pre-populated from API', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();

    await expect(settings.displayNameInput).toBeVisible();
    await expect(settings.displayNameInput).toHaveValue('Alice');
  });

  test('currency select is visible and pre-populated from API', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();

    await expect(settings.currencySelect).toBeVisible();
    await expect(settings.currencySelect).toHaveValue('GBP');
  });

  test('monthly budget input is visible and pre-populated from API', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();

    await expect(settings.monthlyBudgetInput).toBeVisible();
    await expect(settings.monthlyBudgetInput).toHaveValue('2000');
  });

  test('Save Settings button is visible and enabled', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();

    await expect(settings.saveButton).toBeVisible();
    await expect(settings.saveButton).toBeEnabled();
  });

  test('no success message is shown on initial load', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();

    // .success-message is conditionally rendered with *ngIf so it must not be
    // in the DOM on the initial page load.
    await expect(settings.successMessage).not.toBeVisible();
  });

  test('no error message is shown on initial load', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();

    await expect(settings.errorMessage).not.toBeVisible();
  });
});

// ─── 2. Success message auto-dismiss (task 28) ────────────────────────────────

test.describe('Settings — success message auto-dismiss (task 28)', () => {
  test.beforeEach(async ({ page }) => {
    await stubAuth(page);

    await page.route(`${apiUrl}/settings`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          display_name: 'Alice',
          currency: 'GBP',
          monthly_budget: 2000,
        }),
      })
    );
  });

  test('success message appears immediately after saving', async ({ page }) => {
    // Stub PUT to succeed.
    await page.route(`${apiUrl}/settings`, async route => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            display_name: 'Alice',
            currency: 'GBP',
            monthly_budget: 2000,
          }),
        });
      } else {
        await route.continue();
      }
    });

    const settings = new SettingsPage(page);
    await settings.goto();

    await settings.saveSettings({ monthlyBudget: 2000 });

    await expect(settings.successMessage).toBeVisible({ timeout: 5000 });
    await expect(settings.successMessage).toContainText('saved');
  });

  test('success message auto-dismisses after approximately 3 seconds (task 28)', async ({ page }) => {
    await page.route(`${apiUrl}/settings`, async route => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            display_name: 'Alice',
            currency: 'GBP',
            monthly_budget: 2000,
          }),
        });
      } else {
        await route.continue();
      }
    });

    const settings = new SettingsPage(page);
    await settings.goto();

    await settings.saveSettings({ monthlyBudget: 2000 });

    // The message must appear first.
    await expect(settings.successMessage).toBeVisible({ timeout: 5000 });

    // Then it must disappear within ~4 s (the component uses setTimeout 3000 ms,
    // so we give 4 s to account for test overhead).
    await expect(settings.successMessage).not.toBeVisible({ timeout: 4500 });
  });

  test('error message is shown when the PUT request fails', async ({ page }) => {
    await page.route(`${apiUrl}/settings`, async route => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Internal server error' }),
        });
      } else {
        await route.continue();
      }
    });

    const settings = new SettingsPage(page);
    await settings.goto();

    await settings.saveSettings({ monthlyBudget: 2000 });

    await expect(settings.errorMessage).toBeVisible({ timeout: 5000 });
    await expect(settings.errorMessage).toContainText('Failed to save');
  });
});

// ─── 3. Blank display_name does not overwrite existing value (task 28) ────────

test.describe('Settings — blank display_name handling (task 28)', () => {
  test('submitting with a blank display_name omits it from the PUT payload', async ({ page }) => {
    await stubAuth(page);

    // Load existing settings with a real name.
    await page.route(`${apiUrl}/settings`, async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            display_name: 'Alice',
            currency: 'GBP',
            monthly_budget: 1500,
          }),
        });
        return;
      }

      if (route.request().method() === 'PUT') {
        // Capture what the Angular app actually sent.
        const body = JSON.parse(route.request().postData() ?? '{}');

        // Blank display_name must be filtered out by the component before
        // the PUT is made (Object.entries filter removes '' values).
        expect(body).not.toHaveProperty('display_name');

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ display_name: 'Alice', currency: 'GBP', monthly_budget: 1500 }),
        });
        return;
      }

      await route.continue();
    });

    const settings = new SettingsPage(page);
    await settings.goto();

    // Verify the field is pre-populated with 'Alice'.
    await expect(settings.displayNameInput).toHaveValue('Alice');

    // Clear the display name field to simulate the user leaving it blank.
    await settings.displayNameInput.clear();
    await expect(settings.displayNameInput).toHaveValue('');

    // Save — the PUT must NOT include display_name in its body.
    await settings.saveButton.click();

    await expect(settings.successMessage).toBeVisible({ timeout: 5000 });
  });
});

// ─── 4. Currency change reflected on Dashboard (task 29) — RETIRED ───────────
//
// The money-era dashboard was removed in Task 27 (retired feature layer). The
// currency-on-dashboard reflection test that lived here is gone with it; the
// real spending header is rebuilt inside the Budget screen (Tasks 28/29) and
// will get its own coverage there.

// ─── 5. Auth guard ────────────────────────────────────────────────────────────

test.describe('Settings — authGuard redirect', () => {
  test('visiting /settings without a JWT redirects to /login', async ({ page }) => {
    // Navigate to the base URL first so localStorage is accessible for this
    // origin, then clear any stored token before attempting the protected route.
    await page.goto('/');
    await clearSession(page);
    await page.goto('/settings');

    await page.waitForURL(url => url.pathname.includes('/login'), { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });
});
