import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * TokenRefreshPage — page object for the SEC-1 JWT silent-refresh E2E tests.
 *
 * This page object does NOT map to a single application route.  Instead it
 * collects the localStorage helpers and common locators needed across the four
 * SEC-1 scenarios:
 *
 *  1. Login stores both tokens (fm_access_token + fm_refresh_token)
 *  2. Silent refresh when an expired access token causes an API 401
 *  3. Logout clears both tokens
 *  4. Invalid refresh token triggers logout + redirect to /login
 *
 * localStorage keys
 * -----------------
 * These match the constants in AuthService exactly:
 *   private readonly TOKEN_KEY         = 'fm_access_token'
 *   private readonly REFRESH_TOKEN_KEY = 'fm_refresh_token'
 *
 * Selector rationale
 * ------------------
 *  - `nav.navbar`                   — present only when authenticated (NavigationComponent *ngIf)
 *  - `.settings-page`               — top-level wrapper on the kept /settings screen, used as
 *                                     the "authenticated page loaded" sentinel. The /settings
 *                                     screen fires an authenticated GET /api/settings on load,
 *                                     which is what exercises the interceptor's silent-refresh
 *                                     path (the money-era dashboard that used to do this was
 *                                     retired in Task 27).
 *  - `.login-card`                  — stable BEM wrapper on the login form
 *  - `getByRole('button', 'Login')` — semantic submit-button selector
 *  - `getByLabel()`                 — preferred for form fields tied to <label> elements
 */
export class TokenRefreshPage extends BasePage {
  /** The key AuthService stores the short-lived access token under. */
  static readonly ACCESS_TOKEN_KEY = 'fm_access_token';

  /** The key AuthService stores the 7-day refresh token under. */
  static readonly REFRESH_TOKEN_KEY = 'fm_refresh_token';

  // ── Login page locators ──────────────────────────────────────────────────
  readonly loginCard: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;

  // ── Authenticated-page locators ──────────────────────────────────────────
  /**
   * Top-level /settings wrapper — used as the "reached an authenticated screen"
   * sentinel. The /settings route is a KEPT protected route that fires an
   * authenticated GET /api/settings on load, so it is the trigger point for the
   * interceptor's silent-refresh path (replacing the retired dashboard).
   */
  readonly settingsContainer: Locator;

  // ── Navigation locators ──────────────────────────────────────────────────
  /** Nav bar — present in DOM only when authenticated. */
  readonly navbar: Locator;

  /** Logout button inside the nav bar. */
  readonly logoutButton: Locator;

  constructor(page: Page) {
    super(page);
    this.loginCard          = page.locator('.login-card');
    this.emailInput         = page.getByLabel('Email');
    // `exact: true` prevents matching the "Show password" toggle button, whose
    // aria-label ("Show password") otherwise also satisfies a substring match.
    this.passwordInput      = page.getByLabel('Password', { exact: true });
    this.loginButton        = page.getByRole('button', { name: 'Login' });
    this.settingsContainer  = page.locator('.settings-page');
    this.navbar             = page.locator('nav.navbar');
    this.logoutButton       = page.locator('nav.navbar button.logout-btn');
  }

  // ── localStorage helpers ─────────────────────────────────────────────────

  /**
   * Returns the current value of fm_access_token from localStorage,
   * or null if it is absent.
   */
  async getAccessToken(): Promise<string | null> {
    return this.page.evaluate(
      (key: string) => localStorage.getItem(key),
      TokenRefreshPage.ACCESS_TOKEN_KEY
    );
  }

  /**
   * Returns the current value of fm_refresh_token from localStorage,
   * or null if it is absent.
   */
  async getRefreshToken(): Promise<string | null> {
    return this.page.evaluate(
      (key: string) => localStorage.getItem(key),
      TokenRefreshPage.REFRESH_TOKEN_KEY
    );
  }

  /**
   * Writes an arbitrary string to fm_access_token in localStorage.
   * Use this to overwrite a valid token with an expired one mid-test.
   */
  async setAccessToken(token: string): Promise<void> {
    await this.page.evaluate(
      (args: string[]) => localStorage.setItem(args[0], args[1]),
      [TokenRefreshPage.ACCESS_TOKEN_KEY, token]
    );
  }

  /**
   * Writes an arbitrary string to fm_refresh_token in localStorage.
   */
  async setRefreshToken(token: string): Promise<void> {
    await this.page.evaluate(
      (args: string[]) => localStorage.setItem(args[0], args[1]),
      [TokenRefreshPage.REFRESH_TOKEN_KEY, token]
    );
  }

  /**
   * Removes both token keys from localStorage, simulating a clean
   * logged-out state.
   */
  async clearAllTokens(): Promise<void> {
    await this.page.evaluate(
      (args: string[]) => {
        localStorage.removeItem(args[0]);
        localStorage.removeItem(args[1]);
      },
      [TokenRefreshPage.ACCESS_TOKEN_KEY, TokenRefreshPage.REFRESH_TOKEN_KEY]
    );
  }

  // ── JWT builders ─────────────────────────────────────────────────────────

  /**
   * Builds a structurally-valid (unsigned) JWT whose exp is in the future.
   * Sufficient to pass Angular's authGuard (existence + expiry check) and
   * to make the interceptor issue a refresh request when the backend returns 401.
   *
   * @param expiresInSeconds  Seconds from now until exp.  Default: 365 days.
   */
  buildValidFakeJwt(opts: {
    sub?: string;
    email?: string;
    expiresInSeconds?: number;
  } = {}): string {
    return this._buildJwt(
      opts.sub ?? 'sec1-test-user',
      opts.email ?? 'sec1@example.com',
      Math.floor(Date.now() / 1000) + (opts.expiresInSeconds ?? 86400 * 365)
    );
  }

  /**
   * Builds a structurally-valid (unsigned) JWT whose exp is in the past.
   *
   * IMPORTANT: Angular's authGuard calls AuthService.isAuthenticated(), which
   * re-reads loadUserFromToken() only at service initialisation time (i.e. on
   * app bootstrap).  If the service has already been injected with a valid token
   * in the same browser context, the in-memory currentUser$ is still populated
   * even after you overwrite localStorage with this expired JWT.
   *
   * This token is therefore safe to use as a replacement mid-session so that the
   * *next* HTTP request (which the interceptor will attach it to) triggers a 401
   * from the backend, exercising the silent-refresh path.  It should NOT be used
   * as the initial token when booting the app — use buildValidFakeJwt() for that.
   *
   * @param expiredSecondsAgo  How many seconds in the past the exp is. Default: 3600 (1 h).
   */
  buildExpiredFakeJwt(opts: {
    sub?: string;
    email?: string;
    expiredSecondsAgo?: number;
  } = {}): string {
    return this._buildJwt(
      opts.sub ?? 'sec1-test-user',
      opts.email ?? 'sec1@example.com',
      Math.floor(Date.now() / 1000) - (opts.expiredSecondsAgo ?? 3600)
    );
  }

  private _buildJwt(sub: string, email: string, exp: number): string {
    const b64url = (obj: object) =>
      btoa(JSON.stringify(obj))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    const header  = b64url({ alg: 'HS256', typ: 'JWT' });
    const payload = b64url({ sub, email, display_name: null, exp });
    return `${header}.${payload}.e2e-fake-sig`;
  }
}
