import { test, expect } from '@playwright/test';
import { LandingPage } from '../../pages/landing.page';
import { LoginPage } from '../../pages/login.page';
import { SignupPage } from '../../pages/signup.page';

/**
 * Auth-pages smoke tests
 * ======================
 *
 * Covers the three public-facing pages of the futureMe app:
 *   - Landing page  /
 *   - Login page    /login
 *   - Signup page   /signup
 *
 * All tests are purely visual / interaction checks.  They do NOT require a
 * live backend or a Supabase auth session — no credentials are submitted, no
 * API calls succeed, and no network mocking is needed.
 *
 * Port
 * ----
 * The auth-pages Playwright project points at http://localhost:4200 by default
 * (override with AUTH_PAGES_BASE_URL).  Start the dev server before running:
 *
 *   cd frontend && ng serve
 *   npx playwright test --project=auth-pages
 *
 * Selector strategy
 * -----------------
 * All selectors live in page-object classes under e2e/pages/.  Specs never
 * contain raw CSS selectors or DOM queries.
 *
 *   1. getByRole()    — preferred for headings, buttons, and links.
 *   2. getByLabel()   — preferred for form inputs (tied to <label> text).
 *   3. Scoped class   — only when role/label selectors are not available;
 *                       always scoped to a stable parent class.
 */

// ─── 1. Landing page ──────────────────────────────────────────────────────────

test.describe('Landing page — /', () => {
  test('should render the hero headline', async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    // The landing component renders an <h1> inside .hero.
    // We assert visibility and that it contains the expected opening words.
    await expect(landing.heroHeadline).toBeVisible();
    await expect(landing.heroHeadline).toContainText('Financial peace');
  });

  test('should render 3 feature cards', async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    // The template emits three <div class="feature card"> elements in .features-inner.
    await expect(landing.featureCards).toHaveCount(3);
  });

  test('should have a working "Get Started" link to /signup', async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    // The link is visible and clicking it navigates to /signup.
    await expect(landing.getStartedLink).toBeVisible();
    await landing.getStartedLink.click();
    await page.waitForURL('**/signup');
    expect(page.url()).toContain('/signup');
  });

  test('should have a working "Sign In" link to /login', async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    await expect(landing.signInLink).toBeVisible();
    await landing.signInLink.click();
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });

  test('should render .btn-primary as block-level on the CTA buttons (not collapsed)', async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    // styles.scss sets `.btn-primary { display: inline-block }` so the <a> tag
    // renders as a button-shaped block rather than collapsing to zero width.
    // We verify the computed display value is "inline-block".
    const display = await landing.getDisplayValue(landing.heroPrimaryBtn);
    expect(display).toBe('inline-block');
  });
});

// ─── 2. Login page ────────────────────────────────────────────────────────────

test.describe('Login page — /login', () => {
  test('should render the login form with email and password fields', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // The login form has two inputs labelled "Email" and "Password".
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
  });

  test('should show an error when submitting empty fields', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Submitting without filling any fields triggers the inline validation in
    // LoginComponent.validateForm() which sets errorMessage = 'Please enter
    // email and password' and renders it in .error-message.
    await loginPage.submitButton.click();

    const errorMessage = page.locator('.error-message');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('Please enter email and password');
  });

  test('should navigate to /signup when clicking the sign-up link', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // The login card contains a "Sign up" link (routerLink="/signup") inside
    // .signup-link.  Clicking it must navigate to /signup.
    await expect(loginPage.signupLink).toBeVisible();
    await loginPage.signupLink.click();
    await page.waitForURL('**/signup');
    expect(page.url()).toContain('/signup');
  });

  test('should have the submit button use the btn-primary class', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // The login template uses <button class="btn-primary"> (not the old
    // .login-button class).  We verify the class attribute directly.
    await expect(loginPage.submitButton).toBeVisible();
    const classList = await loginPage.submitButton.getAttribute('class');
    expect(classList).toContain('btn-primary');
  });
});

// ─── 3. Signup page ───────────────────────────────────────────────────────────

test.describe('Signup page — /signup', () => {
  test('should render all four input fields', async ({ page }) => {
    const signupPage = new SignupPage(page);
    await signupPage.goto();

    // The signup form has four inputs: Full Name, Email, Password, Confirm Password.
    await expect(signupPage.nameInput).toBeVisible();
    await expect(signupPage.emailInput).toBeVisible();
    await expect(signupPage.passwordInput).toBeVisible();
    await expect(signupPage.confirmPasswordInput).toBeVisible();
  });

  test('should show an error when passwords do not match', async ({ page }) => {
    const signupPage = new SignupPage(page);
    await signupPage.goto();

    // Fill valid name + email + mismatched passwords.
    // SignupComponent.validateForm() checks `password !== confirmPassword` and
    // sets errorMessage = 'Passwords do not match'.
    await signupPage.nameInput.fill('Test User');
    await signupPage.emailInput.fill('test@example.com');
    await signupPage.passwordInput.fill('password123');
    await signupPage.confirmPasswordInput.fill('different456');
    await signupPage.submitButton.click();

    const errorMessage = page.locator('.error-message');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('Passwords do not match');
  });

  test('should show an error when password is too short', async ({ page }) => {
    const signupPage = new SignupPage(page);
    await signupPage.goto();

    // SignupComponent.validateForm() rejects passwords shorter than 6 characters
    // with errorMessage = 'Password must be at least 6 characters'.
    await signupPage.nameInput.fill('Test User');
    await signupPage.emailInput.fill('test@example.com');
    await signupPage.passwordInput.fill('abc');
    await signupPage.confirmPasswordInput.fill('abc');
    await signupPage.submitButton.click();

    const errorMessage = page.locator('.error-message');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('Password must be at least 6 characters');
  });

  test('should navigate to /login when clicking the login link', async ({ page }) => {
    const signupPage = new SignupPage(page);
    await signupPage.goto();

    // The signup card contains a "Login" link (routerLink="/login") inside
    // .login-link.  Clicking it must navigate to /login.
    await expect(signupPage.loginLink).toBeVisible();
    await signupPage.loginLink.click();
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });

  test('should have the submit button use the btn-primary class', async ({ page }) => {
    const signupPage = new SignupPage(page);
    await signupPage.goto();

    // The signup template uses <button class="btn-primary"> (not the old
    // .signup-button class).  We verify the class attribute directly.
    await expect(signupPage.submitButton).toBeVisible();
    const classList = await signupPage.submitButton.getAttribute('class');
    expect(classList).toContain('btn-primary');
  });
});
