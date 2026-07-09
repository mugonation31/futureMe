import { test, expect } from '@playwright/test';
import { OnboardingPage } from '../../pages/onboarding.page';
import { BudgetPage } from '../../pages/budget.page';
import { loginAs, clearSession } from '../../utils/auth';

/**
 * Household onboarding E2E tests
 * ================================
 *
 * Coverage
 * --------
 * 1. Static rendering — the /onboarding page renders both cards correctly
 *    without requiring a live API (UI-only assertions against visible text
 *    and form controls).
 *
 * 2. Guard: unauthenticated access to /budget → redirect to /login.
 *    Does NOT require a live backend — the authGuard fires before any API
 *    call when there is no auth session in localStorage.
 *
 * 3. Guard: unauthenticated access to /onboarding → redirect to /login.
 *    Same reasoning as above.
 *
 * 4. Create household (happy path) — requires a live backend + a test user
 *    that has NO existing household.  Reads credentials from:
 *      E2E_USER_NO_HOUSEHOLD_EMAIL
 *      E2E_USER_NO_HOUSEHOLD_PASSWORD
 *    Skipped when those env vars are absent so the suite still passes in CI
 *    environments that only provide static/smoke vars.
 *
 * 5. Join household by invite code (happy path) — requires a live backend +
 *    a test user with no household AND a valid invite code from an existing
 *    household.  Reads from:
 *      E2E_USER_JOIN_EMAIL
 *      E2E_USER_JOIN_PASSWORD
 *      E2E_INVITE_CODE
 *
 * 6. Create household — inline error when API fails (simulated via network
 *    route interception so no live backend is needed).
 *
 * 7. Join household — inline error when API returns a non-2xx response
 *    (simulated via network route interception).
 *
 * 8. Guard: authenticated user with no household visiting /budget is
 *    redirected to /onboarding (simulated via route mocking).
 *
 * Environment variables (set in frontend/e2e/.env)
 * -------------------------------------------------
 *   E2E_BASE_URL                    — default http://localhost:4202
 *   E2E_API_URL                     — backend base URL, e.g. http://localhost:8001/api
 *   E2E_USER_NO_HOUSEHOLD_EMAIL     — test user with no household
 *   E2E_USER_NO_HOUSEHOLD_PASSWORD
 *   E2E_USER_JOIN_EMAIL             — second test user with no household
 *   E2E_USER_JOIN_PASSWORD
 *   E2E_INVITE_CODE                 — valid invite code for an existing household
 *
 * Selector strategy
 * -----------------
 * All selectors are delegated to page-object methods/locators.  Specs never
 * contain raw CSS strings or DOM queries directly.
 */

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Base API URL used for route mocking (Playwright's page.route). */
const apiUrl = process.env['E2E_API_URL'] ?? 'http://localhost:8001/api';

// ─── 1. Static rendering (no auth, no backend) ────────────────────────────────

test.describe('Onboarding page — static rendering', () => {
  // The /onboarding route is protected by authGuard.  To test the rendered
  // UI without a real session we intercept the householdGuard's /households/me
  // call so the Angular app thinks the user is logged-in with no household.
  // These tests rely on a pre-authenticated context.  They are marked to skip
  // when credentials are absent, and they use page.route() to stub the
  // households/me endpoint so they do NOT depend on a live database.

  test('page title is "futureMe"', async ({ page }) => {
    // Navigate to /login first (public route) and check title — this is
    // always safe and does not require credentials.
    await page.goto('/login');
    await expect(page).toHaveTitle('futureMe');
  });

  test('onboarding URL requires authentication — unauthenticated visit redirects to /login', async ({ page }) => {
    // Fresh context means no auth session in storage.
    await page.goto('/onboarding');

    // authGuard redirects to /login with a returnUrl query param.
    await page.waitForURL(url => url.pathname.includes('/login'), { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });
});

// ─── 2. Route guard: unauthenticated users ────────────────────────────────────

test.describe('Route guards — unauthenticated user', () => {
  // Each test runs in a clean context with no stored session.

  test('visiting /budget without a session redirects to /login', async ({ page }) => {
    await page.goto('/budget');

    await page.waitForURL(url => url.pathname.includes('/login'), { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('/login redirect preserves the originally requested URL as returnUrl', async ({ page }) => {
    await page.goto('/budget');

    await page.waitForURL(url => url.pathname.includes('/login'), { timeout: 10000 });
    expect(page.url()).toContain('returnUrl=%2Fbudget');
  });

  test('visiting /settings without a session redirects to /login', async ({ page }) => {
    await page.goto('/settings');

    await page.waitForURL(url => url.pathname.includes('/login'), { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });
});

// ─── 3. Onboarding page UI (with mocked auth + mocked household API) ──────────

test.describe('Onboarding page — UI elements (mocked session)', () => {
  /**
   * We stub the households/me endpoint so that the Angular app loads the
   * /onboarding page without requiring a live database.
   *
   * Angular's householdGuard calls: GET <apiUrl>/households/me
   *
   * We route-intercept that call and skip these tests when there is no
   * authenticated session to make them meaningful.  See the credential-based
   * tests below for full end-to-end coverage.
   *
   * These tests are therefore purely structural: they check that the correct
   * HTML is emitted by the Angular template, using a logged-in session
   * provided via E2E_USER_NO_HOUSEHOLD_EMAIL creds.  If those env vars are
   * absent the tests skip gracefully.
   */

  test.beforeEach(async ({ page }) => {
    const email    = process.env['E2E_USER_NO_HOUSEHOLD_EMAIL'];
    const password = process.env['E2E_USER_NO_HOUSEHOLD_PASSWORD'];

    if (!email || !password) {
      test.skip(true, 'E2E_USER_NO_HOUSEHOLD_EMAIL / _PASSWORD not set — skipping authenticated UI tests');
      return;
    }

    // Stub the household check so the guard lets us through to /onboarding.
    await page.route(`${apiUrl}/households/me`, route =>
      route.fulfill({ status: 404, body: JSON.stringify({ detail: 'No household' }) })
    );

    await loginAs(page, email, password);

    // After login the app tries /households/me — the stub above returns 404,
    // so the login component routes the user to /onboarding.
    await page.waitForURL(url => url.pathname.includes('/onboarding'), { timeout: 15000 });
  });

  test('onboarding wrapper is visible', async ({ page }) => {
    const onboarding = new OnboardingPage(page);
    await expect(onboarding.onboardingWrapper).toBeVisible();
  });

  test('"Create a household" heading is visible', async ({ page }) => {
    const onboarding = new OnboardingPage(page);
    await expect(onboarding.createHeading).toBeVisible();
  });

  test('"Join a household" heading is visible', async ({ page }) => {
    const onboarding = new OnboardingPage(page);
    await expect(onboarding.joinHeading).toBeVisible();
  });

  test('household name input is visible and enabled', async ({ page }) => {
    const onboarding = new OnboardingPage(page);
    await expect(onboarding.householdNameInput).toBeVisible();
    await expect(onboarding.householdNameInput).toBeEnabled();
  });

  test('invite code input is visible and enabled', async ({ page }) => {
    const onboarding = new OnboardingPage(page);
    await expect(onboarding.inviteCodeInput).toBeVisible();
    await expect(onboarding.inviteCodeInput).toBeEnabled();
  });

  test('"Create" button is visible and enabled', async ({ page }) => {
    const onboarding = new OnboardingPage(page);
    await expect(onboarding.createButton).toBeVisible();
    await expect(onboarding.createButton).toBeEnabled();
  });

  test('"Join" button is visible and enabled', async ({ page }) => {
    const onboarding = new OnboardingPage(page);
    await expect(onboarding.joinButton).toBeVisible();
    await expect(onboarding.joinButton).toBeEnabled();
  });

  test('no error messages are shown on initial load', async ({ page }) => {
    const onboarding = new OnboardingPage(page);
    // .error-text elements are conditionally rendered with *ngIf so they should
    // not be in the DOM until an error occurs.
    await expect(page.locator('.error-text')).toHaveCount(0);
  });
});

// ─── 4. Create household — error state (API failure simulated) ────────────────

test.describe('Create household — error handling (mocked API)', () => {
  test.beforeEach(async ({ page }) => {
    const email    = process.env['E2E_USER_NO_HOUSEHOLD_EMAIL'];
    const password = process.env['E2E_USER_NO_HOUSEHOLD_PASSWORD'];

    if (!email || !password) {
      test.skip(true, 'E2E_USER_NO_HOUSEHOLD_EMAIL / _PASSWORD not set — skipping');
      return;
    }

    // Stub households/me → 404 so guard routes to /onboarding.
    await page.route(`${apiUrl}/households/me`, route =>
      route.fulfill({ status: 404, body: JSON.stringify({ detail: 'No household' }) })
    );

    await loginAs(page, email, password);
    await page.waitForURL(url => url.pathname.includes('/onboarding'), { timeout: 15000 });
  });

  test('shows inline error when POST /households returns 500', async ({ page }) => {
    // Override the create endpoint to simulate a server error.
    await page.route(`${apiUrl}/households`, route => {
      if (route.request().method() === 'POST') {
        route.fulfill({ status: 500, body: JSON.stringify({ detail: 'Internal server error' }) });
      } else {
        route.continue();
      }
    });

    const onboarding = new OnboardingPage(page);
    await onboarding.createHousehold('Test Household');

    // The component sets createError = 'Failed to create household. Please try again.'
    await expect(onboarding.createError).toBeVisible();
    await expect(onboarding.createError).toContainText('Failed to create household');
  });

  test('"Create" button is disabled while the request is in-flight', async ({ page }) => {
    // Delay the response so we can observe the loading state.
    await page.route(`${apiUrl}/households`, async route => {
      if (route.request().method() === 'POST') {
        await new Promise(resolve => setTimeout(resolve, 800));
        route.fulfill({ status: 500, body: JSON.stringify({ detail: 'error' }) });
      } else {
        route.continue();
      }
    });

    const onboarding = new OnboardingPage(page);
    await onboarding.householdNameInput.fill('Loading Test');
    await onboarding.createButton.click();

    // While the request is pending the button label changes to "Creating..."
    // and the [disabled] binding activates.
    await expect(onboarding.createButton).toBeDisabled();
  });

  test('"Create" button re-enables after an API error', async ({ page }) => {
    await page.route(`${apiUrl}/households`, route => {
      if (route.request().method() === 'POST') {
        route.fulfill({ status: 500, body: JSON.stringify({ detail: 'error' }) });
      } else {
        route.continue();
      }
    });

    const onboarding = new OnboardingPage(page);
    await onboarding.createHousehold('Error Test');

    // After the error the loading flag is reset so the button should re-enable.
    await expect(onboarding.createButton).toBeEnabled();
  });
});

// ─── 5. Join household — error state (API failure simulated) ──────────────────

test.describe('Join household — error handling (mocked API)', () => {
  test.beforeEach(async ({ page }) => {
    const email    = process.env['E2E_USER_NO_HOUSEHOLD_EMAIL'];
    const password = process.env['E2E_USER_NO_HOUSEHOLD_PASSWORD'];

    if (!email || !password) {
      test.skip(true, 'E2E_USER_NO_HOUSEHOLD_EMAIL / _PASSWORD not set — skipping');
      return;
    }

    await page.route(`${apiUrl}/households/me`, route =>
      route.fulfill({ status: 404, body: JSON.stringify({ detail: 'No household' }) })
    );

    await loginAs(page, email, password);
    await page.waitForURL(url => url.pathname.includes('/onboarding'), { timeout: 15000 });
  });

  test('shows inline error when POST /households/join returns 404', async ({ page }) => {
    await page.route(`${apiUrl}/households/join`, route =>
      route.fulfill({ status: 404, body: JSON.stringify({ detail: 'Invite code not found' }) })
    );

    const onboarding = new OnboardingPage(page);
    await onboarding.joinHousehold('INVALID-CODE');

    // The component sets joinError = 'Failed to join household. Please check the invite code.'
    await expect(onboarding.joinError).toBeVisible();
    await expect(onboarding.joinError).toContainText('Failed to join household');
  });

  test('"Join" button is disabled while the request is in-flight', async ({ page }) => {
    await page.route(`${apiUrl}/households/join`, async route => {
      await new Promise(resolve => setTimeout(resolve, 800));
      route.fulfill({ status: 404, body: JSON.stringify({ detail: 'not found' }) });
    });

    const onboarding = new OnboardingPage(page);
    await onboarding.inviteCodeInput.fill('SLOW-CODE');
    await onboarding.joinButton.click();

    await expect(onboarding.joinButton).toBeDisabled();
  });

  test('"Join" button re-enables after an API error', async ({ page }) => {
    await page.route(`${apiUrl}/households/join`, route =>
      route.fulfill({ status: 404, body: JSON.stringify({ detail: 'not found' }) })
    );

    const onboarding = new OnboardingPage(page);
    await onboarding.joinHousehold('BAD-CODE');

    await expect(onboarding.joinButton).toBeEnabled();
  });
});

// ─── 6. Household guard: authenticated user with no household → /onboarding ───

test.describe('householdGuard — authenticated user with no household', () => {
  test('visiting /budget when user has no household redirects to /onboarding', async ({ page }) => {
    const email    = process.env['E2E_USER_NO_HOUSEHOLD_EMAIL'];
    const password = process.env['E2E_USER_NO_HOUSEHOLD_PASSWORD'];

    if (!email || !password) {
      test.skip(true, 'E2E_USER_NO_HOUSEHOLD_EMAIL / _PASSWORD not set — skipping');
      return;
    }

    // Stub /households/me to return 404 regardless of timing so the
    // householdGuard's catchError handler always fires.
    await page.route(`${apiUrl}/households/me`, route =>
      route.fulfill({ status: 404, body: JSON.stringify({ detail: 'No household' }) })
    );

    await loginAs(page, email, password);

    // After login the component checks /households/me, gets 404, and routes
    // to /onboarding.  Navigate directly to /budget to exercise the guard.
    await page.goto('/budget');

    await page.waitForURL(url => url.pathname.includes('/onboarding'), { timeout: 15000 });
    expect(page.url()).toContain('/onboarding');
  });
});

// ─── 7. Create household — happy path (live backend required) ─────────────────

test.describe('Create household — happy path (live backend)', () => {
  test('creating a household redirects the user to /budget', async ({ page }) => {
    const email    = process.env['E2E_USER_NO_HOUSEHOLD_EMAIL'];
    const password = process.env['E2E_USER_NO_HOUSEHOLD_PASSWORD'];

    if (!email || !password) {
      test.skip(true, 'E2E_USER_NO_HOUSEHOLD_EMAIL / _PASSWORD not set — skipping live test');
      return;
    }

    // Do NOT stub households/me here — we want the real guard + real API.
    // If this user already has a household the test will land on /budget
    // immediately and the assertion will still pass, but the create flow
    // won't be exercised.  Provision a dedicated "no household" test account.
    // Note: components still navigate(['/dashboard']); the router aliases that
    // to /budget via a pathMatch:'full' redirect (Task 27).

    await loginAs(page, email, password);

    const currentUrl = page.url();

    if (currentUrl.includes('/onboarding')) {
      const onboarding = new OnboardingPage(page);

      const uniqueName = `E2E Household ${Date.now()}`;
      await onboarding.createHousehold(uniqueName);

      await page.waitForURL(url => url.pathname.includes('/budget'), { timeout: 20000 });
    }

    // Either we arrived on /budget via the create flow, or the user already
    // had a household and was redirected there by login.  Either way we must
    // be on /budget.
    expect(page.url()).toContain('/budget');

    const budget = new BudgetPage(page);
    await expect(budget.heading).toBeVisible();
  });
});

// ─── 8. Join household by invite code — happy path (live backend required) ────

test.describe('Join household by invite code — happy path (live backend)', () => {
  test('joining with a valid invite code redirects the user to /budget', async ({ page }) => {
    const email      = process.env['E2E_USER_JOIN_EMAIL'];
    const password   = process.env['E2E_USER_JOIN_PASSWORD'];
    const inviteCode = process.env['E2E_INVITE_CODE'];

    if (!email || !password || !inviteCode) {
      test.skip(
        true,
        'E2E_USER_JOIN_EMAIL / _PASSWORD / E2E_INVITE_CODE not set — skipping live join test'
      );
      return;
    }

    // Stub the household check during login so the user is routed to /onboarding.
    await page.route(`${apiUrl}/households/me`, route =>
      route.fulfill({ status: 404, body: JSON.stringify({ detail: 'No household' }) })
    );

    await loginAs(page, email, password);
    await page.waitForURL(url => url.pathname.includes('/onboarding'), { timeout: 15000 });

    // Now remove the stub so the real join call goes through.
    await page.unroute(`${apiUrl}/households/me`);

    const onboarding = new OnboardingPage(page);
    await onboarding.joinHousehold(inviteCode);

    await page.waitForURL(url => url.pathname.includes('/budget'), { timeout: 20000 });
    expect(page.url()).toContain('/budget');

    const budget = new BudgetPage(page);
    await expect(budget.heading).toBeVisible();
  });
});

// ─── 9. Post-login routing: user with existing household goes to /budget ──────

test.describe('Login routing — user with an existing household', () => {
  test('logging in with a user that has a household lands on /budget', async ({ page }) => {
    const email    = process.env['E2E_USER_WITH_HOUSEHOLD_EMAIL'];
    const password = process.env['E2E_USER_WITH_HOUSEHOLD_PASSWORD'];

    if (!email || !password) {
      test.skip(
        true,
        'E2E_USER_WITH_HOUSEHOLD_EMAIL / _PASSWORD not set — skipping'
      );
      return;
    }

    await loginAs(page, email, password);

    await page.waitForURL(url => url.pathname.includes('/budget'), { timeout: 20000 });
    expect(page.url()).toContain('/budget');

    const budget = new BudgetPage(page);
    await expect(budget.heading).toBeVisible();
  });
});
