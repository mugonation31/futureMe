import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * ForgotPasswordPage encapsulates selectors and actions for the /forgot-password route.
 *
 * Selector rationale:
 *  - getByLabel()              — preferred for the email input; tied to <label> text.
 *  - getByRole('button')       — semantic role for the submit button.
 *  - getByRole('heading')      — resilient heading selector.
 *  - `.login-card`             — the ForgotPasswordComponent reuses the same card
 *                                wrapper class as login/signup (verified against
 *                                forgot-password.component.html).
 *  - `.success-message`        — inline success banner rendered after a valid
 *                                email submission; hidden via *ngIf="submitted".
 *  - `.error-message`          — inline error element, consistent with login/signup.
 */
export class ForgotPasswordPage extends BasePage {
  /** Outer card wrapper — shares `.login-card` with the login/signup pages. */
  readonly forgotPasswordCard: Locator;

  /** Page heading, expected to read something like "Forgot Password". */
  readonly heading: Locator;

  /** Email address input. */
  readonly emailInput: Locator;

  /** Submit / "Send reset link" button. */
  readonly submitButton: Locator;

  /**
   * Success banner shown after the server accepts the email.
   * Expected text: "Check your inbox — we've sent a reset link."
   */
  readonly successMessage: Locator;

  /**
   * Inline error element shown on validation failures or API errors.
   * Uses the same `.error-message` class as login / signup.
   */
  readonly errorMessage: Locator;

  /**
   * Link back to /login (expected inside the card, similar to how
   * /signup has a link back to /login).
   */
  readonly backToLoginLink: Locator;

  constructor(page: Page) {
    super(page);

    this.forgotPasswordCard = page.locator('.login-card');
    this.heading            = page.getByRole('heading', { name: /forgot password/i });
    this.emailInput         = page.getByLabel('Email');
    this.submitButton       = page.getByRole('button', { name: /send reset link/i });
    this.successMessage     = page.locator('.success-message');
    this.errorMessage       = page.locator('.error-message');
    this.backToLoginLink    = page.getByRole('link', { name: /back to login/i });
  }

  override async goto() {
    await super.goto('/forgot-password');
  }

  /** Types the given email address into the email field. */
  async fillEmail(email: string): Promise<void> {
    await this.emailInput.fill(email);
  }

  /** Clicks the submit button. */
  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /**
   * Fills the email field and submits the form in one step.
   * Returns after the click; callers should assert the outcome.
   */
  async requestReset(email: string): Promise<void> {
    await this.fillEmail(email);
    await this.submit();
  }

  /** Waits for the success message to appear in the DOM and be visible. */
  async waitForSuccess(): Promise<void> {
    await this.successMessage.waitFor({ state: 'visible' });
  }

  /** Waits for the error message to appear in the DOM and be visible. */
  async waitForError(): Promise<void> {
    await this.errorMessage.waitFor({ state: 'visible' });
  }
}
