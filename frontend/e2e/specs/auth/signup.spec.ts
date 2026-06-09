import { test, expect } from '@playwright/test';
import { SignupPage } from '../../pages/signup.page';

/**
 * Signup form — first-name / last-name split E2E tests
 * =====================================================
 *
 * Covers the sign-up form changes that replaced the single "Full Name" input
 * with separate "First Name" and "Last Name" inputs.
 *
 * Network strategy
 * ----------------
 * Three of the four tests exercise only client-side validation in
 * SignupComponent.validateForm(), which aborts before any API call is made.
 * Those tests require no network mocking.
 *
 * The fourth test (successful registration) intercepts POST /api/auth/register
 * via page.route() and returns a minimal AuthResponse so the AuthService can
 * store the tokens and Angular can navigate to /onboarding.  No live backend
 * is required.
 *
 * The interception URL is read from the E2E_API_URL environment variable
 * (default: http://localhost:8002/api) — the same value used by all other
 * mocked-API specs in this project.
 *
 * Port
 * ----
 * This spec runs under the "signup" Playwright project which uses
 * AUTH_PAGES_BASE_URL (default: http://localhost:4200).
 *
 * Selector strategy
 * -----------------
 * All selectors live in SignupPage (e2e/pages/signup.page.ts).
 * This spec contains no raw CSS selectors or DOM queries.
 */

const apiUrl = process.env['E2E_API_URL'] ?? 'http://localhost:8002/api';

// ─── 1. Form structure ────────────────────────────────────────────────────────

test.describe('Signup form — field structure', () => {
  /**
   * Confirms the template was updated: First Name and Last Name inputs are
   * present; the old "Full Name" input is gone.
   */
  test('renders "First Name" and "Last Name" inputs instead of a single "Full Name" input', async ({ page }) => {
    const signup = new SignupPage(page);
    await signup.goto();

    // Both new fields must be visible.
    await expect(signup.firstNameInput).toBeVisible();
    await expect(signup.lastNameInput).toBeVisible();

    // The old "Full Name" field must no longer exist in the DOM.
    await expect(page.getByLabel('Full Name')).toHaveCount(0);
  });
});

// ─── 2. First Name validation ─────────────────────────────────────────────────

test.describe('Signup form — First Name validation', () => {
  /**
   * SignupComponent.validateForm() checks `!this.firstName.trim()` first.
   * Submitting with an empty field (or whitespace only) must show the inline
   * error "First name is required" without making any API call.
   */
  test('shows "First name is required" error when First Name is empty', async ({ page }) => {
    const signup = new SignupPage(page);
    await signup.goto();

    // Fill every field except First Name, then submit.
    await signup.lastNameInput.fill('Smith');
    await signup.emailInput.fill('test@example.com');
    await signup.passwordInput.fill('Secure1!');
    await signup.confirmPasswordInput.fill('Secure1!');
    await signup.submitButton.click();

    await expect(signup.errorMessage).toBeVisible();
    await expect(signup.errorMessage).toContainText('First name is required');
    // User must remain on /signup — no API call fired, no navigation.
    expect(page.url()).toContain('/signup');
  });

  test('shows "First name is required" error when First Name is whitespace only', async ({ page }) => {
    const signup = new SignupPage(page);
    await signup.goto();

    // Whitespace-only value satisfies the HTML `required` constraint but is
    // caught by the `.trim()` check in validateForm().
    await signup.firstNameInput.fill('   ');
    await signup.lastNameInput.fill('Smith');
    await signup.emailInput.fill('test@example.com');
    await signup.passwordInput.fill('Secure1!');
    await signup.confirmPasswordInput.fill('Secure1!');
    await signup.submitButton.click();

    await expect(signup.errorMessage).toBeVisible();
    await expect(signup.errorMessage).toContainText('First name is required');
    expect(page.url()).toContain('/signup');
  });
});

// ─── 3. Last Name validation ──────────────────────────────────────────────────

test.describe('Signup form — Last Name validation', () => {
  /**
   * validateForm() checks `!this.lastName.trim()` only after the First Name
   * check passes.  So we fill in a valid First Name and leave Last Name empty.
   */
  test('shows "Last name is required" error when Last Name is empty', async ({ page }) => {
    const signup = new SignupPage(page);
    await signup.goto();

    // Fill every field except Last Name, then submit.
    await signup.firstNameInput.fill('Jane');
    await signup.emailInput.fill('test@example.com');
    await signup.passwordInput.fill('Secure1!');
    await signup.confirmPasswordInput.fill('Secure1!');
    await signup.submitButton.click();

    await expect(signup.errorMessage).toBeVisible();
    await expect(signup.errorMessage).toContainText('Last name is required');
    expect(page.url()).toContain('/signup');
  });

  test('shows "Last name is required" error when Last Name is whitespace only', async ({ page }) => {
    const signup = new SignupPage(page);
    await signup.goto();

    await signup.firstNameInput.fill('Jane');
    await signup.lastNameInput.fill('   ');
    await signup.emailInput.fill('test@example.com');
    await signup.passwordInput.fill('Secure1!');
    await signup.confirmPasswordInput.fill('Secure1!');
    await signup.submitButton.click();

    await expect(signup.errorMessage).toBeVisible();
    await expect(signup.errorMessage).toContainText('Last name is required');
    expect(page.url()).toContain('/signup');
  });
});

// ─── 4. Successful registration ───────────────────────────────────────────────

test.describe('Signup form — successful registration', () => {
  /**
   * Intercept POST /api/auth/register and return a minimal AuthResponse.
   * The AuthService stores the tokens and navigates to /onboarding.
   *
   * We also verify the intercepted request body contains first_name and
   * last_name (not the old full_name field), confirming the payload shape.
   */
  test('navigates to /onboarding after successful registration and sends first_name + last_name', async ({ page }) => {
    const signup = new SignupPage(page);

    // Build a minimal fake JWT so AuthService can parse user data from the token.
    const fakeJwt = [
      btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
      btoa(JSON.stringify({ sub: 'test-id', email: 'jane@example.com', display_name: 'Jane Smith', exp: Math.floor(Date.now() / 1000) + 86400 })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
      'e2e-fake-sig',
    ].join('.');

    // Capture the request body so we can assert the payload shape.
    let capturedBody: Record<string, unknown> | null = null;

    await page.route(`${apiUrl}/auth/register`, async route => {
      const req = route.request();
      try {
        capturedBody = await req.postDataJSON() as Record<string, unknown>;
      } catch {
        // postDataJSON() can throw if the body is not JSON — treat as null.
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: fakeJwt,
          refresh_token: 'fake-refresh-token',
          user: {
            id: 'test-id',
            email: 'jane@example.com',
            display_name: 'Jane Smith',
          },
        }),
      });
    });

    // Navigate to /signup after the route intercept is registered.
    await signup.goto();

    await signup.fillAndSubmit({
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      password: 'Secure1!',
      confirmPassword: 'Secure1!',
    });

    // Angular should navigate away from /signup to /onboarding.
    await page.waitForURL('**/onboarding', { timeout: 10000 });
    expect(page.url()).toContain('/onboarding');

    // Confirm the request body used first_name / last_name, not full_name.
    expect(capturedBody).not.toBeNull();
    expect(capturedBody!['first_name']).toBe('Jane');
    expect(capturedBody!['last_name']).toBe('Smith');
    expect(capturedBody!['email']).toBe('jane@example.com');
    expect(capturedBody).not.toHaveProperty('full_name');
  });
});
