import { test, expect, Page } from '@playwright/test';
import { TokenRefreshPage } from '../../pages/token-refresh.page';

/**
 * SEC-1 — JWT refresh-token silent-renewal E2E tests
 * ===================================================
 *
 * Covers the four scenarios specified in SEC-1:
 *
 *  1. Login stores both tokens
 *     After a successful POST /api/auth/login, localStorage contains both
 *     fm_access_token and fm_refresh_token.
 *
 *  2. Silent refresh on expired access token
 *     When the access token stored in localStorage is overwritten with an
 *     expired JWT and the backend returns 401 on the next API call, the
 *     AuthInterceptor calls POST /api/auth/refresh, retries the original
 *     request with the new access token, and the user remains on /dashboard.
 *
 *  3. Logout clears both tokens
 *     After the user clicks logout, neither fm_access_token nor
 *     fm_refresh_token is present in localStorage.
 *
 *  4. Invalid refresh token triggers logout
 *     When the access token is expired AND the refresh token is invalid,
 *     POST /api/auth/refresh returns 401, the interceptor calls logout()
 *     and the Angular router navigates to /login.
 *
 * Network strategy
 * ----------------
 * All tests use Playwright's page.route() to mock the FastAPI backend so that
 * no live backend is required.  The Angular dev server must be running on the
 * port declared in E2E_BASE_URL (default: http://localhost:4202).
 *
 * Auth guard interaction
 * ----------------------
 * Angular's authGuard calls AuthService.isAuthenticated(), which checks the
 * in-memory currentUserSubject rather than re-parsing localStorage on every
 * navigation.  The subject is populated by loadUserFromToken() at service
 * initialisation (app bootstrap).  This means:
 *
 *  - For the guard to allow access to /dashboard, the access token must be
 *    structurally valid and not yet expired at the time Angular bootstraps.
 *    We inject a far-future fake JWT via seedAuthToken() before the first
 *    navigation so the guard passes.
 *
 *  - The interceptor's silent-refresh path is exercised by replacing the
 *    stored access token with an expired one AFTER the app has already
 *    bootstrapped (i.e. after page.goto('/') + seedAuthToken()).  This way
 *    the in-memory currentUser$ is still populated (guard passes) but the
 *    expired token is what the interceptor will attach to the retried request,
 *    triggering a 401 from the mocked backend.
 *
 * Selector strategy
 * -----------------
 * All selectors live in TokenRefreshPage.  This spec contains no raw CSS
 * strings or DOM queries.
 *
 * Port: uses E2E_BASE_URL (default: http://localhost:4202).
 * API:  uses E2E_API_URL  (default: http://localhost:8002/api).
 */

const apiUrl = process.env['E2E_API_URL'] ?? 'http://localhost:8002/api';

// ── Shared mock data ──────────────────────────────────────────────────────────

/** Minimal household response that satisfies householdGuard. */
const MOCK_HOUSEHOLD = {
  id: 'hh-sec1',
  name: 'SEC-1 Household',
  invite_code: 'SEC1-CODE',
};

/** Minimal dashboard stats response. */
const MOCK_DASHBOARD = {
  total_budget: 1000,
  total_spent: 200,
  remaining_budget: 800,
  savings_rate: 20,
  category_breakdown: [],
};

/** Minimal settings response (satisfies currency pipe). */
const MOCK_SETTINGS = {
  currency: 'GBP',
  monthly_budget: 1000,
};

/**
 * Mocked login response that includes both tokens.
 * The access token has a far-future expiry so it passes authGuard on initial load.
 * The refresh token is an opaque string — the app treats it as-is.
 */
const MOCK_LOGIN_RESPONSE = {
  access_token: (() => {
    const b64url = (o: object) =>
      btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const h = b64url({ alg: 'HS256', typ: 'JWT' });
    const p = b64url({
      sub: 'login-test-user',
      email: 'sec1@example.com',
      display_name: null,
      exp: Math.floor(Date.now() / 1000) + 86400 * 365,
    });
    return `${h}.${p}.mock-sig`;
  })(),
  refresh_token: 'mock-refresh-token-sec1',
  user: { id: 'login-test-user', email: 'sec1@example.com', display_name: null },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Boots the app at the base URL and injects a far-future access token so that
 * authGuard passes when navigating to /dashboard.  Also writes a matching
 * refresh token so that the full token pair is present in localStorage.
 *
 * After this helper the browser has:
 *   fm_access_token  → valid (far-future exp), passes authGuard
 *   fm_refresh_token → 'seed-refresh-token-sec1'
 */
async function seedBothTokens(page: Page, tPage: TokenRefreshPage): Promise<void> {
  // Navigate to the origin first so localStorage is accessible.
  await page.goto('/');

  const accessToken = tPage.buildValidFakeJwt({ email: 'sec1@example.com' });
  await tPage.setAccessToken(accessToken);
  await tPage.setRefreshToken('seed-refresh-token-sec1');
}

/**
 * Registers the standard household, dashboard, and settings mocks.
 * These are needed for householdGuard and the dashboard component to render
 * without erroring.
 */
async function stubDashboardRoutes(page: Page): Promise<void> {
  await page.route(`${apiUrl}/households/me`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_HOUSEHOLD),
    })
  );

  await page.route(`${apiUrl}/dashboard`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_DASHBOARD),
    })
  );

  await page.route(`${apiUrl}/settings`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_SETTINGS),
    })
  );
}

// ── 1. Login stores both tokens ───────────────────────────────────────────────

test.describe('SEC-1 — Login stores both tokens', () => {
  /**
   * After a successful login the Angular AuthService.handleAuth() method calls:
   *   localStorage.setItem('fm_access_token', res.access_token)
   *   localStorage.setItem('fm_refresh_token', res.refresh_token)
   *
   * We stub POST /api/auth/login to return MOCK_LOGIN_RESPONSE and then verify
   * that both keys are present in localStorage after the form submission.
   */
  test('localStorage contains fm_access_token after successful login', async ({ page }) => {
    const tPage = new TokenRefreshPage(page);

    // Ensure both token keys start empty so we are testing a fresh login.
    await page.goto('/');
    await tPage.clearAllTokens();

    // Stub the login endpoint.
    await page.route(`${apiUrl}/auth/login`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_LOGIN_RESPONSE),
      })
    );

    // Stub the post-login redirect target so householdGuard doesn't hard fail.
    await page.route(`${apiUrl}/households/me`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_HOUSEHOLD),
      })
    );

    // Navigate to login and submit the form.
    await tPage.goto('/login');
    await expect(tPage.loginCard).toBeVisible();
    await tPage.emailInput.fill('sec1@example.com');
    await tPage.passwordInput.fill('password123');
    await tPage.loginButton.click();

    // Wait for navigation away from /login (authGuard passes → /dashboard or /onboarding).
    await page.waitForURL(url => !url.pathname.endsWith('/login'), { timeout: 15000 });

    // Assert fm_access_token is present and non-empty.
    const accessToken = await tPage.getAccessToken();
    expect(accessToken).not.toBeNull();
    expect(accessToken!.length).toBeGreaterThan(0);
  });

  test('localStorage contains fm_refresh_token after successful login', async ({ page }) => {
    const tPage = new TokenRefreshPage(page);

    await page.goto('/');
    await tPage.clearAllTokens();

    await page.route(`${apiUrl}/auth/login`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_LOGIN_RESPONSE),
      })
    );

    await page.route(`${apiUrl}/households/me`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_HOUSEHOLD),
      })
    );

    await tPage.goto('/login');
    await expect(tPage.loginCard).toBeVisible();
    await tPage.emailInput.fill('sec1@example.com');
    await tPage.passwordInput.fill('password123');
    await tPage.loginButton.click();

    await page.waitForURL(url => !url.pathname.endsWith('/login'), { timeout: 15000 });

    // Assert fm_refresh_token is present and matches the mocked value.
    const refreshToken = await tPage.getRefreshToken();
    expect(refreshToken).toBe(MOCK_LOGIN_RESPONSE.refresh_token);
  });

  test('both tokens are written to localStorage by a single login', async ({ page }) => {
    const tPage = new TokenRefreshPage(page);

    await page.goto('/');
    await tPage.clearAllTokens();

    await page.route(`${apiUrl}/auth/login`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_LOGIN_RESPONSE),
      })
    );

    await page.route(`${apiUrl}/households/me`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_HOUSEHOLD),
      })
    );

    await tPage.goto('/login');
    await expect(tPage.loginCard).toBeVisible();
    await tPage.emailInput.fill('sec1@example.com');
    await tPage.passwordInput.fill('password123');
    await tPage.loginButton.click();

    await page.waitForURL(url => !url.pathname.endsWith('/login'), { timeout: 15000 });

    // Both keys must be present simultaneously.
    const [accessToken, refreshToken] = await Promise.all([
      tPage.getAccessToken(),
      tPage.getRefreshToken(),
    ]);

    expect(accessToken).not.toBeNull();
    expect(refreshToken).not.toBeNull();
  });
});

// ── 2. Silent refresh on expired access token ─────────────────────────────────

test.describe('SEC-1 — Silent refresh on expired access token', () => {
  /**
   * Scenario:
   *  1. App boots with a valid far-future access token → authGuard passes,
   *     householdGuard calls GET /api/households/me.
   *  2. We overwrite fm_access_token with an expired JWT while the app is live.
   *  3. The next API call (GET /api/dashboard) is stubbed to return 401 on the
   *     first attempt (simulating server-side token expiry) and 200 on retry.
   *  4. The interceptor calls POST /api/auth/refresh → receives a new access
   *     token → stores it → retries GET /api/dashboard → succeeds.
   *  5. The user remains on /dashboard (no redirect to /login).
   *
   * The initial householdGuard call is stubbed to succeed immediately so the
   * guard allows entry to /dashboard.  Only the dashboard data call (step 3)
   * is made to return 401, triggering the interceptor.
   *
   * Why this approach works
   * -----------------------
   * Angular's authGuard checks the in-memory currentUserSubject (set at bootstrap
   * from the original valid token).  Overwriting localStorage after bootstrap
   * does NOT invalidate currentUser$ — so the guard still passes.  However the
   * interceptor reads the raw localStorage value when attaching the Authorization
   * header, so the next HTTP request will carry the expired token and receive 401.
   */
  test('user remains on /dashboard after the interceptor silently refreshes an expired access token', async ({ page }) => {
    const tPage = new TokenRefreshPage(page);

    // Step 1: Boot the app with a valid token so authGuard passes.
    await page.goto('/');
    await tPage.setAccessToken(tPage.buildValidFakeJwt({ email: 'sec1@example.com' }));
    await tPage.setRefreshToken('valid-refresh-token');

    // The new access token the refresh endpoint will return.
    const refreshedAccessToken = tPage.buildValidFakeJwt({
      email: 'sec1@example.com',
      expiresInSeconds: 3600,
    });

    // Step 2: Stub POST /api/auth/refresh to return a new access token.
    await page.route(`${apiUrl}/auth/refresh`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access_token: refreshedAccessToken }),
      })
    );

    // Step 3: Stub GET /api/households/me to always succeed
    // (householdGuard must pass for /dashboard to be reachable).
    await page.route(`${apiUrl}/households/me`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_HOUSEHOLD),
      })
    );

    // Step 4: Stub GET /api/settings (needed by the currency pipe).
    await page.route(`${apiUrl}/settings`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SETTINGS),
      })
    );

    // Step 5: Stub GET /api/dashboard to return 401 on the FIRST call and
    // 200 on the second (retry after refresh).
    let dashboardCallCount = 0;
    await page.route(`${apiUrl}/dashboard`, route => {
      dashboardCallCount += 1;
      if (dashboardCallCount === 1) {
        // First call — simulate expired access token on the server side.
        route.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"Token expired"}' });
      } else {
        // Second call — retry after refresh succeeds.
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_DASHBOARD),
        });
      }
    });

    // Step 6: Navigate to /dashboard.  At this point the in-memory token is
    // valid (authGuard passes).  The dashboard component fires GET /api/dashboard
    // which returns 401, triggering the interceptor.
    await page.goto('/dashboard');

    // Step 7: The user must remain on /dashboard — no redirect to /login.
    await expect(tPage.dashboardContainer).toBeVisible({ timeout: 15000 });
    expect(page.url()).toContain('/dashboard');
    expect(page.url()).not.toContain('/login');
  });

  test('the interceptor stores the new access token in localStorage after a silent refresh', async ({ page }) => {
    const tPage = new TokenRefreshPage(page);

    await page.goto('/');
    await tPage.setAccessToken(tPage.buildValidFakeJwt({ email: 'sec1@example.com' }));
    await tPage.setRefreshToken('valid-refresh-token');

    const refreshedAccessToken = tPage.buildValidFakeJwt({
      email: 'sec1@example.com',
      expiresInSeconds: 3600,
    });

    await page.route(`${apiUrl}/auth/refresh`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access_token: refreshedAccessToken }),
      })
    );

    await page.route(`${apiUrl}/households/me`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_HOUSEHOLD),
      })
    );

    await page.route(`${apiUrl}/settings`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SETTINGS),
      })
    );

    let dashboardCallCount = 0;
    await page.route(`${apiUrl}/dashboard`, route => {
      dashboardCallCount += 1;
      if (dashboardCallCount === 1) {
        route.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"Token expired"}' });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_DASHBOARD),
        });
      }
    });

    await page.goto('/dashboard');

    // Wait for the dashboard to fully render — this confirms the retry succeeded.
    await expect(tPage.dashboardContainer).toBeVisible({ timeout: 15000 });

    // After the interceptor calls storeAccessToken(), localStorage must hold the
    // new token that the refresh endpoint returned.
    const storedToken = await tPage.getAccessToken();
    expect(storedToken).toBe(refreshedAccessToken);
  });

  test('the refresh endpoint is called exactly once when a 401 is received', async ({ page }) => {
    const tPage = new TokenRefreshPage(page);

    await page.goto('/');
    await tPage.setAccessToken(tPage.buildValidFakeJwt({ email: 'sec1@example.com' }));
    await tPage.setRefreshToken('valid-refresh-token');

    const refreshedAccessToken = tPage.buildValidFakeJwt({ expiresInSeconds: 3600 });
    let refreshCallCount = 0;

    await page.route(`${apiUrl}/auth/refresh`, route => {
      refreshCallCount += 1;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access_token: refreshedAccessToken }),
      });
    });

    await page.route(`${apiUrl}/households/me`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_HOUSEHOLD),
      })
    );

    await page.route(`${apiUrl}/settings`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SETTINGS),
      })
    );

    let dashboardCallCount = 0;
    await page.route(`${apiUrl}/dashboard`, route => {
      dashboardCallCount += 1;
      if (dashboardCallCount === 1) {
        route.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"Token expired"}' });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_DASHBOARD),
        });
      }
    });

    await page.goto('/dashboard');
    await expect(tPage.dashboardContainer).toBeVisible({ timeout: 15000 });

    // The interceptor must call refresh exactly once per 401, not in a loop.
    expect(refreshCallCount).toBe(1);
  });
});

// ── 3. Logout clears both tokens ──────────────────────────────────────────────

test.describe('SEC-1 — Logout clears both tokens', () => {
  /**
   * After the user clicks the logout button:
   *   AuthService.logout() removes fm_access_token and fm_refresh_token
   *   from localStorage and nulls currentUserSubject.
   *
   * We seed both tokens, render the dashboard (nav bar visible → logout button
   * accessible), click logout, and then assert that both keys are absent.
   */
  test('fm_access_token is removed from localStorage after logout', async ({ page }) => {
    const tPage = new TokenRefreshPage(page);

    // Seed both tokens and stub API routes so /dashboard renders with nav bar.
    await page.goto('/');
    await tPage.setAccessToken(tPage.buildValidFakeJwt({ email: 'sec1@example.com' }));
    await tPage.setRefreshToken('refresh-token-for-logout-test');
    await stubDashboardRoutes(page);

    await page.goto('/dashboard');
    await expect(tPage.dashboardContainer).toBeVisible({ timeout: 15000 });

    // The navbar must be present (user is authenticated) before clicking logout.
    await expect(tPage.navbar).toBeVisible();
    await tPage.logoutButton.click();

    // Wait for the redirect to /login that logout() + router.navigate() triggers.
    await page.waitForURL(url => url.pathname.includes('/login'), { timeout: 10000 });

    // fm_access_token must be gone.
    const accessToken = await tPage.getAccessToken();
    expect(accessToken).toBeNull();
  });

  test('fm_refresh_token is removed from localStorage after logout', async ({ page }) => {
    const tPage = new TokenRefreshPage(page);

    await page.goto('/');
    await tPage.setAccessToken(tPage.buildValidFakeJwt({ email: 'sec1@example.com' }));
    await tPage.setRefreshToken('refresh-token-for-logout-test');
    await stubDashboardRoutes(page);

    await page.goto('/dashboard');
    await expect(tPage.dashboardContainer).toBeVisible({ timeout: 15000 });

    await expect(tPage.navbar).toBeVisible();
    await tPage.logoutButton.click();

    await page.waitForURL(url => url.pathname.includes('/login'), { timeout: 10000 });

    // fm_refresh_token must be gone.
    const refreshToken = await tPage.getRefreshToken();
    expect(refreshToken).toBeNull();
  });

  test('both tokens are absent simultaneously after logout', async ({ page }) => {
    const tPage = new TokenRefreshPage(page);

    await page.goto('/');
    await tPage.setAccessToken(tPage.buildValidFakeJwt({ email: 'sec1@example.com' }));
    await tPage.setRefreshToken('refresh-token-for-logout-test');
    await stubDashboardRoutes(page);

    await page.goto('/dashboard');
    await expect(tPage.dashboardContainer).toBeVisible({ timeout: 15000 });

    await expect(tPage.navbar).toBeVisible();
    await tPage.logoutButton.click();

    await page.waitForURL(url => url.pathname.includes('/login'), { timeout: 10000 });

    const [accessToken, refreshToken] = await Promise.all([
      tPage.getAccessToken(),
      tPage.getRefreshToken(),
    ]);

    expect(accessToken).toBeNull();
    expect(refreshToken).toBeNull();
  });
});

// ── 4. Invalid refresh token triggers logout ──────────────────────────────────

test.describe('SEC-1 — Invalid refresh token triggers logout and redirect', () => {
  /**
   * Scenario:
   *  1. App boots with a valid far-future access token → authGuard passes.
   *  2. GET /api/dashboard returns 401 → interceptor fires.
   *  3. POST /api/auth/refresh also returns 401 (invalid/expired refresh token).
   *  4. The interceptor's catchError calls authService.logout() + router.navigate(['/login']).
   *  5. User is redirected to /login.
   *
   * The interceptor guard in auth.interceptor.ts prevents infinite loops by
   * checking req.url.includes('/auth/refresh') — if the refresh call itself
   * returns 401, it bails out immediately.
   */
  test('user is redirected to /login when the refresh token is invalid', async ({ page }) => {
    const tPage = new TokenRefreshPage(page);

    // Boot app with a valid (guard-passing) access token and an invalid refresh token.
    await page.goto('/');
    await tPage.setAccessToken(tPage.buildValidFakeJwt({ email: 'sec1@example.com' }));
    await tPage.setRefreshToken('invalid-refresh-token');

    // POST /api/auth/refresh returns 401 — the refresh token is rejected.
    await page.route(`${apiUrl}/auth/refresh`, route =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: '{"detail":"Invalid or expired refresh token"}',
      })
    );

    // GET /api/households/me must succeed so householdGuard passes.
    await page.route(`${apiUrl}/households/me`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_HOUSEHOLD),
      })
    );

    // GET /api/settings (currency pipe) — succeed so it doesn't interfere.
    await page.route(`${apiUrl}/settings`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SETTINGS),
      })
    );

    // GET /api/dashboard returns 401 → triggers the interceptor.
    await page.route(`${apiUrl}/dashboard`, route =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: '{"detail":"Token expired"}',
      })
    );

    // Navigate to /dashboard — guard passes (in-memory token is valid).
    await page.goto('/dashboard');

    // The failed refresh must cause a redirect to /login.
    await page.waitForURL(url => url.pathname.includes('/login'), { timeout: 15000 });
    expect(page.url()).toContain('/login');
  });

  test('fm_access_token is cleared from localStorage after a failed refresh', async ({ page }) => {
    const tPage = new TokenRefreshPage(page);

    await page.goto('/');
    await tPage.setAccessToken(tPage.buildValidFakeJwt({ email: 'sec1@example.com' }));
    await tPage.setRefreshToken('invalid-refresh-token');

    await page.route(`${apiUrl}/auth/refresh`, route =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: '{"detail":"Invalid or expired refresh token"}',
      })
    );

    await page.route(`${apiUrl}/households/me`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_HOUSEHOLD),
      })
    );

    await page.route(`${apiUrl}/settings`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SETTINGS),
      })
    );

    await page.route(`${apiUrl}/dashboard`, route =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: '{"detail":"Token expired"}',
      })
    );

    await page.goto('/dashboard');
    await page.waitForURL(url => url.pathname.includes('/login'), { timeout: 15000 });

    // logout() removes both tokens — fm_access_token must be gone.
    const accessToken = await tPage.getAccessToken();
    expect(accessToken).toBeNull();
  });

  test('fm_refresh_token is cleared from localStorage after a failed refresh', async ({ page }) => {
    const tPage = new TokenRefreshPage(page);

    await page.goto('/');
    await tPage.setAccessToken(tPage.buildValidFakeJwt({ email: 'sec1@example.com' }));
    await tPage.setRefreshToken('invalid-refresh-token');

    await page.route(`${apiUrl}/auth/refresh`, route =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: '{"detail":"Invalid or expired refresh token"}',
      })
    );

    await page.route(`${apiUrl}/households/me`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_HOUSEHOLD),
      })
    );

    await page.route(`${apiUrl}/settings`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SETTINGS),
      })
    );

    await page.route(`${apiUrl}/dashboard`, route =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: '{"detail":"Token expired"}',
      })
    );

    await page.goto('/dashboard');
    await page.waitForURL(url => url.pathname.includes('/login'), { timeout: 15000 });

    // logout() removes both tokens — fm_refresh_token must be gone.
    const refreshToken = await tPage.getRefreshToken();
    expect(refreshToken).toBeNull();
  });

  test('the interceptor does not retry the refresh call when /auth/refresh itself returns 401', async ({ page }) => {
    /**
     * Regression guard: the interceptor has an explicit short-circuit:
     *   if (req.url.includes('/auth/refresh')) { logout(); navigate('/login'); }
     * This prevents an infinite 401 → refresh → 401 loop.
     *
     * We count how many times /auth/refresh is called — it must be exactly 1.
     */
    const tPage = new TokenRefreshPage(page);

    await page.goto('/');
    await tPage.setAccessToken(tPage.buildValidFakeJwt({ email: 'sec1@example.com' }));
    await tPage.setRefreshToken('invalid-refresh-token');

    let refreshCallCount = 0;
    await page.route(`${apiUrl}/auth/refresh`, route => {
      refreshCallCount += 1;
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: '{"detail":"Invalid or expired refresh token"}',
      });
    });

    await page.route(`${apiUrl}/households/me`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_HOUSEHOLD),
      })
    );

    await page.route(`${apiUrl}/settings`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SETTINGS),
      })
    );

    await page.route(`${apiUrl}/dashboard`, route =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: '{"detail":"Token expired"}',
      })
    );

    await page.goto('/dashboard');
    await page.waitForURL(url => url.pathname.includes('/login'), { timeout: 15000 });

    // The refresh endpoint must have been called exactly once — no retry loop.
    expect(refreshCallCount).toBe(1);
  });
});
