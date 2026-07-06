/**
 * Household onboarding E2E tests.
 *
 * REQUIRES: Docker Compose running (`docker compose up -d --build`)
 * REQUIRES: Test users pre-created in Neon. Set environment variables — see e2e/fixtures/users.ts.
 *
 * Covers:
 *   - Create a household → redirects to /dashboard
 *   - Join a household with a valid invite code → redirects to /dashboard
 *   - Join with an invalid code → shows inline error, stays on /onboarding
 *   - Create with blank name → shows inline error, stays on /onboarding
 *   - Onboarding page is inaccessible to unauthenticated users
 */

import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/login.page';
import { OnboardingPage } from '../../pages/onboarding.page';
import { testUsers } from '../../fixtures/users';

/**
 * Helper: log in as the no-household user and land on /onboarding.
 * Used by most tests in this suite as their starting state.
 */
async function loginAndReachOnboarding(page: any) {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(testUsers.noHousehold.email, testUsers.noHousehold.password);
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 });
}

test.describe('Onboarding — create household', () => {
  test('creates a household and redirects to /dashboard', async ({ page }) => {
    await loginAndReachOnboarding(page);

    const onboarding = new OnboardingPage(page);
    await onboarding.isLoaded();

    await onboarding.createHousehold(`Test Home ${Date.now()}`);

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });

  test('shows inline error when household name is blank', async ({ page }) => {
    await loginAndReachOnboarding(page);
    const onboarding = new OnboardingPage(page);

    // Submit without filling the name
    await onboarding.createHousehold('');

    // Should stay on /onboarding with an error
    await expect(page).toHaveURL(/\/onboarding/);
    const error = await onboarding.createError();
    expect(error).toBeTruthy();
  });
});

test.describe('Onboarding — join household', () => {
  test('joins a household with a valid invite code and redirects to /dashboard', async ({ page }) => {
    await loginAndReachOnboarding(page);
    const onboarding = new OnboardingPage(page);
    await onboarding.isLoaded();

    // TEST_INVITE_CODE must be set to a valid code from the owner's household
    const inviteCode = process.env['TEST_INVITE_CODE'] ?? 'TESTCODE';
    await onboarding.joinHousehold(inviteCode);

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });

  test('shows inline error for an invalid invite code', async ({ page }) => {
    await loginAndReachOnboarding(page);
    const onboarding = new OnboardingPage(page);
    await onboarding.isLoaded();

    await onboarding.joinHousehold('BADCODE');

    // Should stay on /onboarding
    await expect(page).toHaveURL(/\/onboarding/);
    const error = await onboarding.joinError();
    expect(error).toBeTruthy();
  });
});

test.describe('Onboarding — access control', () => {
  test('unauthenticated user visiting /onboarding is redirected to /login', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('user who already has a household visiting /onboarding is redirected to /dashboard', async ({ page }) => {
    // Log in as the owner who already has a household
    const login = new LoginPage(page);
    await login.goto();
    await login.login(testUsers.owner.email, testUsers.owner.password);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });

    // Now try to navigate to /onboarding
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });
});
