/**
 * Auth flow E2E tests.
 *
 * REQUIRES: Docker Compose running (`docker compose up -d --build`)
 * REQUIRES: Test users pre-created in Neon. Set environment variables — see e2e/fixtures/users.ts.
 *
 * Covers:
 *   - Signup → redirects to /onboarding (not /dashboard)
 *   - Login (user WITH household) → redirects to /dashboard
 *   - Login (user WITHOUT household) → redirects to /onboarding
 *   - Unauthenticated access to /dashboard → redirected to /login
 */

import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/login.page';
import { SignupPage } from '../../pages/signup.page';
import { testUsers } from '../../fixtures/users';

test.describe('Signup flow', () => {
  test('redirects to /onboarding after successful signup', async ({ page }) => {
    const signup = new SignupPage(page);
    await signup.goto();

    await signup.signup(
      testUsers.newUser.name,
      testUsers.newUser.email,
      testUsers.newUser.password
    );

    // Should land on /onboarding, not /dashboard
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 });
  });

  test('shows error when passwords do not match', async ({ page }) => {
    const signup = new SignupPage(page);
    await signup.goto();

    await signup.fillName('Test User');
    await signup.fillEmail(`mismatch.${Date.now()}@example.com`);
    await signup.fillPassword('Password1!');
    await signup.fillConfirmPassword('DifferentPassword!');
    await signup.submit();

    // Should stay on /signup and show an error
    await expect(page).toHaveURL(/\/signup/);
    const error = await signup.errorMessage();
    expect(error).toBeTruthy();
  });

  test('shows error for already-registered email', async ({ page }) => {
    const signup = new SignupPage(page);
    await signup.goto();

    await signup.signup(
      testUsers.owner.email,
      testUsers.owner.email,
      testUsers.owner.password
    );

    await expect(page).toHaveURL(/\/signup/);
  });
});

test.describe('Login flow', () => {
  test('redirects to /dashboard when user already has a household', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await login.login(testUsers.owner.email, testUsers.owner.password);

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });

  test('redirects to /onboarding when user has no household', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await login.login(testUsers.noHousehold.email, testUsers.noHousehold.password);

    await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 });
  });

  test('shows error for invalid credentials', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await login.login('wrong@example.com', 'wrongpassword');

    // Should stay on /login
    await expect(page).toHaveURL(/\/login/);
    const error = await login.errorMessage();
    expect(error).toBeTruthy();
  });
});

test.describe('Route guards', () => {
  test('unauthenticated access to /dashboard redirects to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('authenticated user without household accessing /dashboard redirects to /onboarding', async ({ page }) => {
    // Log in as the no-household user first
    const login = new LoginPage(page);
    await login.goto();
    await login.login(testUsers.noHousehold.email, testUsers.noHousehold.password);
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 });

    // Now try navigating directly to /dashboard
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 });
  });
});
