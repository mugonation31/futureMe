import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * LoginPage encapsulates selectors and actions for the /login route.
 *
 * Selector rationale:
 *  - getByLabel()   — preferred for form fields; matches <label> text and ties to <input>.
 *  - getByRole()    — used for the submit button ("Login") since it is a semantic button.
 *  - `.login-card`  — stable BEM class on the card wrapper; used for visibility checks.
 *  - `.subtitle`    — subtitle paragraph that contains the "Invoice Me" brand reference.
 *
 * Note on brand visibility:
 *  The login subtitle reads "Sign in to futureMe". The <title> of the document is
 *  "futureMe" and the footer paragraph ".footer-copy" shows "© {year} futureMe".
 */
export class LoginPage extends BasePage {
  readonly loginCard: Locator;
  readonly heading: Locator;
  readonly subtitle: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly signupLink: Locator;

  constructor(page: Page) {
    super(page);
    this.loginCard    = page.locator('.login-card');
    this.heading      = page.getByRole('heading', { name: 'Welcome Back' });
    this.subtitle     = page.locator('.subtitle');
    this.emailInput   = page.getByLabel('Email');
    // `exact: true` prevents matching the "Show password" toggle button, whose
    // aria-label ("Show password") otherwise also satisfies a substring match.
    this.passwordInput = page.getByLabel('Password', { exact: true });
    this.submitButton = page.getByRole('button', { name: 'Login' });
    this.signupLink   = page.getByRole('link', { name: 'Sign up' });
  }

  override async goto() {
    await super.goto('/login');
  }
}
