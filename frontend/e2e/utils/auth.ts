import { Page } from '@playwright/test';

/**
 * E2E authentication utilities for futureMe.
 *
 * These helpers drive the real /login form so that Supabase issues a genuine
 * JWT and the Angular app stores the session in localStorage exactly as it
 * does in production.  All subsequent page navigations in the same browser
 * context will therefore pass the authGuard.
 *
 * Usage
 * -----
 * In a beforeEach / test body:
 *
 *   import { loginAs } from '../../utils/auth';
 *   await loginAs(page, process.env['E2E_USER_EMAIL']!, process.env['E2E_USER_PASSWORD']!);
 *
 * Credentials are read from environment variables so they never appear in
 * committed code.  Set them in `frontend/e2e/.env`:
 *
 *   E2E_USER_EMAIL=your-test-user@example.com
 *   E2E_USER_PASSWORD=supersecret
 *   E2E_USER_WITH_HOUSEHOLD_EMAIL=household-owner@example.com
 *   E2E_USER_WITH_HOUSEHOLD_PASSWORD=supersecret
 */

/**
 * Drives the /login form for the given credentials and waits until Angular
 * has navigated away from /login (i.e. session is established).
 *
 * After this call the page is on /dashboard or /onboarding depending on
 * whether the test-user has a household.
 */
export async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');

  // Fill email — matched via <label for="email"> → id="email"
  await page.getByLabel('Email').fill(email);

  // Fill password — matched via <label for="password"> → id="password"
  await page.getByLabel('Password').fill(password);

  // Submit the form
  await page.getByRole('button', { name: 'Login' }).click();

  // Wait for navigation away from /login — the app redirects to either
  // /dashboard or /onboarding once the Supabase session is established.
  await page.waitForURL(url => !url.pathname.endsWith('/login'), {
    timeout: 15000,
  });
}

/**
 * Clears the Supabase session from localStorage and sessionStorage so the
 * next navigation will be treated as unauthenticated.
 *
 * Supabase stores the session under keys that start with "sb-" so we clear
 * every entry whose key matches that prefix rather than hard-coding the full
 * project-specific key.
 */
export async function clearSession(page: Page): Promise<void> {
  await page.evaluate(() => {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-')) keysToRemove.push(key);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    const sessionKeysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('sb-')) sessionKeysToRemove.push(key);
    }
    sessionKeysToRemove.forEach(k => sessionStorage.removeItem(k));
  });
}
