import { Page } from '@playwright/test';

/**
 * E2E authentication utilities for futureMe.
 *
 * These helpers drive the real /login form so that the backend issues a genuine
 * JWT and the Angular app stores the session in localStorage exactly as it
 * does in production (key: "fm_access_token").  All subsequent page navigations
 * in the same browser context will therefore pass the authGuard.
 *
 * Usage
 * -----
 * In a beforeEach / test body:
 *
 *   import { loginAs, seedAuthToken, clearSession } from '../../utils/auth';
 *
 *   // Drive the real form (requires a running backend):
 *   await loginAs(page, process.env['E2E_USER_EMAIL']!, process.env['E2E_USER_PASSWORD']!);
 *
 *   // Inject a signed JWT directly (no backend needed):
 *   await seedAuthToken(page, signedJwt);
 *
 * Credentials are read from environment variables so they never appear in
 * committed code.  Set them in `frontend/e2e/.env`.
 */

/** The localStorage key that AuthService uses to store the JWT. */
export const TOKEN_KEY = 'fm_access_token';

/**
 * Drives the /login form for the given credentials and waits until Angular
 * has navigated away from /login (i.e. session is established).
 *
 * After this call the page is on /dashboard or /onboarding depending on
 * whether the test-user has a household.
 *
 * Requires: Angular dev server + FastAPI backend both running.
 */
export async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');

  // Fill email — matched via <label for="display_name"> → id="email"
  await page.getByLabel('Email').fill(email);

  // Fill password — matched via <label for="password"> → id="password"
  await page.getByLabel('Password').fill(password);

  // Submit the form
  await page.getByRole('button', { name: 'Login' }).click();

  // Wait for navigation away from /login — the app redirects to either
  // /dashboard or /onboarding once the JWT session is established.
  await page.waitForURL(url => !url.pathname.endsWith('/login'), {
    timeout: 15000,
  });
}

/**
 * Injects a pre-signed JWT directly into localStorage under the key that
 * AuthService reads ("fm_access_token").  This bypasses the login UI entirely
 * so tests can reach protected routes without a running backend — as long as
 * the token is structurally valid (the Angular authGuard only checks for its
 * presence and expiry, not its signature).
 *
 * Build a token with a far-future expiry for E2E use:
 *   python -c "
 *     import base64, json, time
 *     header  = base64.urlsafe_b64encode(json.dumps({'alg':'HS256','typ':'JWT'}).encode()).rstrip(b'=')
 *     payload = base64.urlsafe_b64encode(json.dumps({'sub':'test-user-id','email':'test@example.com','exp': int(time.time())+86400*365}).encode()).rstrip(b'=')
 *     print(f'{header.decode()}.{payload.decode()}.fakesig')
 *   "
 *
 * The page must have been navigated at least once (so the origin is established)
 * before calling this helper.
 */
export async function seedAuthToken(page: Page, token: string): Promise<void> {
  await page.evaluate(
    ([key, tok]: [string, string]) => localStorage.setItem(key, tok),
    [TOKEN_KEY, token]
  );
}

/**
 * Clears the JWT session from localStorage so the next navigation will be
 * treated as unauthenticated.
 */
export async function clearSession(page: Page): Promise<void> {
  await page.evaluate((key: string) => {
    localStorage.removeItem(key);
  }, TOKEN_KEY);
}

/**
 * Builds a minimal, structurally-valid (but unsigned) JWT with a far-future
 * expiry.  Sufficient to satisfy the Angular authGuard's existence + expiry
 * check; will be rejected by the FastAPI backend.  Use seedAuthToken() to
 * inject it.
 *
 * For tests that also need API calls to succeed, use loginAs() instead.
 */
export function buildFakeJwt(opts: {
  sub?: string;
  email?: string;
  display_name?: string;
  expiresInSeconds?: number;
} = {}): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const payload = btoa(JSON.stringify({
    sub: opts.sub ?? 'e2e-test-user',
    email: opts.email ?? 'e2e@example.com',
    display_name: opts.display_name ?? null,
    exp: Math.floor(Date.now() / 1000) + (opts.expiresInSeconds ?? 86400 * 365),
  })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${header}.${payload}.e2e-fake-signature`;
}
