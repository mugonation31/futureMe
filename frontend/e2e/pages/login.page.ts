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
 *  The login subtitle reads "Login to your Invoice Me account", which does NOT contain
 *  the "futureMe" brand string. The <title> of the document is "futureMe" and the
 *  footer brand span ".footer-brand" also shows "futureMe". Both are checked in the spec.
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
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: 'Login' });
    this.signupLink   = page.getByRole('link', { name: 'Sign up' });
  }

  async goto() {
    await super.goto('/login');
  }
}
