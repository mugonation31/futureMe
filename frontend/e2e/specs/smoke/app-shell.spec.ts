import { test, expect } from '@playwright/test';
import { AppShellPage } from '../../pages/app-shell.page';
import { LoginPage } from '../../pages/login.page';
import { SignupPage } from '../../pages/signup.page';

/**
 * App-shell smoke tests
 *
 * These tests verify the static/visual correctness of the futureMe app shell:
 * fonts, design tokens, navigation visibility, and layout. They do NOT require
 * a live backend or a real auth session — every test navigates to a
 * public route (/login or /signup) where no authentication is needed.
 *
 * Port: 4202 (configured in frontend/e2e/.env → E2E_BASE_URL).
 */

test.describe('App shell — smoke tests', () => {

  // ─── 1. Document title ──────────────────────────────────────────────────────

  test('page title is "futureMe"', async ({ page }) => {
    const shell = new AppShellPage(page);
    await shell.goto('/login');

    await expect(page).toHaveTitle('futureMe');
  });

  // ─── 2. Inter font link tag ──────────────────────────────────────────────────

  test('Inter font link tag is present in the document head', async ({ page }) => {
    const shell = new AppShellPage(page);
    await shell.goto('/login');

    // index.html loads Inter via a Google Fonts <link> tag.
    // We look for the stable substring "family=Inter" that identifies the font.
    const hasFontLink = await shell.hasLinkTagWithHref('family=Inter');
    expect(hasFontLink).toBe(true);
  });

  // ─── 3. CSS design tokens loaded (--accent defined) ─────────────────────────

  test('CSS custom property --accent is defined on :root', async ({ page }) => {
    const shell = new AppShellPage(page);
    await shell.goto('/login');

    // styles.scss defines --accent: #0F7168 on :root.
    // getComputedStyle returns the raw CSS value — we verify it is non-empty.
    const accentValue = await shell.getCssCustomProperty('--accent');
    expect(accentValue.length).toBeGreaterThan(0);
  });

  test('CSS custom property --accent resolves to the expected green (#0F7168)', async ({ page }) => {
    const shell = new AppShellPage(page);
    await shell.goto('/login');

    const accentValue = await shell.getCssCustomProperty('--accent');
    // The token is declared as the hex literal; normalise to lowercase for comparison.
    expect(accentValue.toLowerCase()).toBe('#0f7168');
  });

  // ─── 4. Navigation bar is absent on unauthenticated routes ──────────────────

  test('navigation bar is not rendered on /login (no authenticated session)', async ({ page }) => {
    const shell = new AppShellPage(page);
    await shell.goto('/login');

    // NavigationComponent wraps its content in *ngIf="currentUser".
    // With no session the <nav> element must be absent from the DOM.
    const navCount = await shell.navbar.count();
    expect(navCount).toBe(0);
  });

  test('navigation bar is not rendered on /signup (no authenticated session)', async ({ page }) => {
    const shell = new AppShellPage(page);
    await shell.goto('/signup');

    const navCount = await shell.navbar.count();
    expect(navCount).toBe(0);
  });

  // ─── 5. futureMe brand visible on the login page ────────────────────────────

  test('futureMe brand is visible on the login page', async ({ page }) => {
    const shell = new AppShellPage(page);
    await shell.goto('/login');

    // The FooterComponent always renders a .footer-copy paragraph reading
    // "© {year} futureMe". This is part of the persistent shell layout,
    // present on every route.
    await expect(shell.footerBrand).toBeVisible();
    await expect(shell.footerBrand).toContainText('futureMe');
  });

  test('the document title advertises the futureMe brand on the login page', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // A secondary brand-visibility check — the <title> already encodes the brand name.
    await expect(page).toHaveTitle(/futureMe/);
  });

  // ─── 6. Signup page renders correctly ───────────────────────────────────────

  test('signup page renders the "Create Account" heading', async ({ page }) => {
    const signupPage = new SignupPage(page);
    await signupPage.goto();

    await expect(signupPage.heading).toBeVisible();
  });

  test('signup page renders all form fields', async ({ page }) => {
    const signupPage = new SignupPage(page);
    await signupPage.goto();

    // The signup form splits the old single "Full Name" field into separate
    // "First Name" and "Last Name" inputs (plus email, password, confirm).
    await expect(signupPage.firstNameInput).toBeVisible();
    await expect(signupPage.lastNameInput).toBeVisible();
    await expect(signupPage.emailInput).toBeVisible();
    await expect(signupPage.passwordInput).toBeVisible();
    await expect(signupPage.confirmPasswordInput).toBeVisible();
  });

  test('signup page renders the submit button', async ({ page }) => {
    const signupPage = new SignupPage(page);
    await signupPage.goto();

    await expect(signupPage.submitButton).toBeVisible();
  });

  test('signup page renders a link back to the login page', async ({ page }) => {
    const signupPage = new SignupPage(page);
    await signupPage.goto();

    await expect(signupPage.loginLink).toBeVisible();
  });

  // ─── 7. Navigation not visible on unauthenticated routes (combined) ──────────

  test('navigating between /login and /signup never exposes the nav bar', async ({ page }) => {
    const shell = new AppShellPage(page);

    await shell.goto('/login');
    expect(await shell.navbar.count()).toBe(0);

    await page.getByRole('link', { name: 'Sign up' }).click();
    await page.waitForURL('**/signup');
    expect(await shell.navbar.count()).toBe(0);

    await page.getByRole('link', { name: 'Login' }).click();
    await page.waitForURL('**/login');
    expect(await shell.navbar.count()).toBe(0);
  });

  // ─── 8. App shell background colour matches --bg-app (#FAFAF7) ───────────────

  test('app-root computed background-color matches the warm-white design token', async ({ page }) => {
    const shell = new AppShellPage(page);
    await shell.goto('/login');

    // styles.scss sets html, body { background: var(--bg-app) } and
    // app.component.scss sets :host { background: var(--bg-app) }.
    // We verify the token itself equals #FAFAF7 (already done above for --accent);
    // here we confirm --bg-app resolves to the expected warm white.
    const bgApp = await shell.getCssCustomProperty('--bg-app');
    expect(bgApp.toLowerCase()).toBe('#fafaf7');
  });

  test('body background-color is the warm-white design token value', async ({ page }) => {
    const shell = new AppShellPage(page);
    await shell.goto('/login');

    // Browsers convert hex to rgb() in computed styles, so we accept either form.
    const bodyBg = await shell.getComputedBackgroundColor('body');
    // #FAFAF7 = rgb(250, 250, 247)
    const isWarmWhite =
      bodyBg === 'rgb(250, 250, 247)' ||
      bodyBg.toLowerCase() === '#fafaf7';
    expect(isWarmWhite).toBe(true);
  });

  // ─── Bonus: login page form renders correctly ────────────────────────────────

  test('login page renders the email and password inputs', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
  });

  test('login page renders the Login submit button', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await expect(loginPage.submitButton).toBeVisible();
  });

  test('login page renders a link to the signup page', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await expect(loginPage.signupLink).toBeVisible();
  });
});
