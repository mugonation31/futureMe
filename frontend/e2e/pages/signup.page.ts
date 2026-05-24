import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * SignupPage encapsulates selectors and actions for the /signup route.
 *
 * Selector rationale:
 *  - getByLabel()  — matches form labels; most resilient for input fields.
 *  - getByRole()   — semantic button role for the submit button.
 *  - `.signup-card` — stable class on the card wrapper.
 */
export class SignupPage extends BasePage {
  readonly signupCard: Locator;
  readonly heading: Locator;
  readonly subtitle: Locator;
  readonly nameInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly submitButton: Locator;
  readonly loginLink: Locator;

  constructor(page: Page) {
    super(page);
    this.signupCard           = page.locator('.signup-card');
    this.heading              = page.getByRole('heading', { name: 'Create Account' });
    this.subtitle             = page.locator('.signup-card .subtitle');
    this.nameInput            = page.getByLabel('Full Name');
    this.emailInput           = page.getByLabel('Email');
    this.passwordInput        = page.getByLabel('Password', { exact: true });
    this.confirmPasswordInput = page.getByLabel('Confirm Password');
    this.submitButton         = page.getByRole('button', { name: 'Sign Up' });
    this.loginLink            = page.getByRole('link', { name: 'Login' });
  }

  async goto() {
    await super.goto('/signup');
  }
}
