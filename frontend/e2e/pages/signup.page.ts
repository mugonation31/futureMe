import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * SignupPage encapsulates selectors and actions for the /signup route.
 *
 * Selector rationale:
 *  - getByLabel()  — matches form labels; most resilient for input fields.
 *  - getByRole()   — semantic button role for the submit button.
 *  - `.signup-card` — stable class on the card wrapper.
 *
 * Note: the form was updated from a single "Full Name" field to two separate
 * "First Name" and "Last Name" fields.  firstNameInput / lastNameInput replace
 * the old nameInput property.
 */
export class SignupPage extends BasePage {
  readonly signupCard: Locator;
  readonly heading: Locator;
  readonly subtitle: Locator;
  /** "First Name" input — replaced the old single "Full Name" input. */
  readonly firstNameInput: Locator;
  /** "Last Name" input — added alongside firstNameInput. */
  readonly lastNameInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly submitButton: Locator;
  readonly loginLink: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.signupCard           = page.locator('.signup-card');
    this.heading              = page.getByRole('heading', { name: 'Create Account' });
    this.subtitle             = page.locator('.signup-card .subtitle');
    this.firstNameInput       = page.getByLabel('First Name');
    this.lastNameInput        = page.getByLabel('Last Name');
    this.emailInput           = page.getByLabel('Email');
    this.passwordInput        = page.getByLabel('Password', { exact: true });
    this.confirmPasswordInput = page.getByLabel('Confirm Password');
    this.submitButton         = page.getByRole('button', { name: 'Sign Up' });
    this.loginLink            = page.getByRole('link', { name: 'Login' });
    this.errorMessage         = page.locator('.error-message');
  }

  override async goto() {
    await super.goto('/signup');
  }

  /**
   * Fills in the signup form with the given values and clicks "Sign Up".
   * Leave a field as an empty string to skip filling it.
   */
  async fillAndSubmit(opts: {
    firstName?: string;
    lastName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }): Promise<void> {
    if (opts.firstName !== undefined) await this.firstNameInput.fill(opts.firstName);
    if (opts.lastName  !== undefined) await this.lastNameInput.fill(opts.lastName);
    if (opts.email     !== undefined) await this.emailInput.fill(opts.email);
    if (opts.password  !== undefined) await this.passwordInput.fill(opts.password);
    if (opts.confirmPassword !== undefined) await this.confirmPasswordInput.fill(opts.confirmPassword);
    await this.submitButton.click();
  }
}
