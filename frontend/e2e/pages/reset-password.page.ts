import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * ResetPasswordPage encapsulates selectors and actions for the /reset-password route.
 *
 * Selector rationale:
 *  - getByLabel()              — preferred for password inputs; tied to <label> text.
 *  - getByRole('button')       — semantic role for the submit button.
 *  - getByRole('heading')      — resilient heading selector.
 *  - `.login-card`             — the ResetPasswordComponent reuses the same card
 *                                wrapper class as login/signup (verified against
 *                                reset-password.component.html).
 *  - `.error-message`[first]   — doubles as the token-missing error (rendered via
 *                                *ngIf="!token") AND as the form validation error
 *                                (*ngIf="errorMessage" inside the form).  The first
 *                                instance in the DOM is always the token-error when
 *                                there is no token present.
 *
 * The route is /reset-password?token=<uuid>.  When `token` is absent the component
 * renders a `.error-message` div (no form) instead of the password form.
 */
export class ResetPasswordPage extends BasePage {
  /** Outer card wrapper — shares `.login-card` with the login/signup pages. */
  readonly resetPasswordCard: Locator;

  /** Page heading — reads "Reset Password" (verified against the component template). */
  readonly heading: Locator;

  /** New password input (labelled "New Password"). */
  readonly newPasswordInput: Locator;

  /** Confirm password input (labelled "Confirm Password"). */
  readonly confirmPasswordInput: Locator;

  /** Submit / "Reset Password" button. */
  readonly submitButton: Locator;

  /**
   * Inline error element shown on validation failures (e.g. passwords do not
   * match) or API errors (e.g. token already used).
   */
  readonly errorMessage: Locator;

  /**
   * Error element rendered when the page loads without a valid `token` query
   * parameter.  The template uses the same `.error-message` class, rendered via
   * *ngIf="!token" — it is the first (and only) `.error-message` in the DOM
   * when no token is present, so `.first()` is used to target it precisely.
   */
  readonly tokenMissingError: Locator;

  /**
   * Success message / banner shown after a successful password reset.
   * The component is expected to hide the form and show this element, then
   * redirect the user to /login.
   */
  readonly successMessage: Locator;

  constructor(page: Page) {
    super(page);

    this.resetPasswordCard   = page.locator('.login-card');
    this.heading             = page.getByRole('heading', { name: /reset password/i });
    this.newPasswordInput    = page.getByLabel('New Password');
    this.confirmPasswordInput = page.getByLabel('Confirm Password');
    this.submitButton        = page.getByRole('button', { name: /reset password/i });
    this.errorMessage        = page.locator('.error-message');
    // The token-missing error uses the same `.error-message` class as other errors.
    // When no token is present it is the first (and only) `.error-message` in the DOM.
    this.tokenMissingError   = page.locator('.error-message').first();
    this.successMessage      = page.locator('.success-message');
  }

  /** Navigate to /reset-password without any token parameter. */
  override async goto() {
    await super.goto('/reset-password');
  }

  /**
   * Navigate to /reset-password with a specific token query parameter.
   * Use this for tests that exercise the happy path or token-validation logic.
   */
  async gotoWithToken(token: string): Promise<void> {
    await super.goto(`/reset-password?token=${encodeURIComponent(token)}`);
  }

  /** Types the given password into the "New Password" field. */
  async fillPassword(password: string): Promise<void> {
    await this.newPasswordInput.fill(password);
  }

  /** Types the given password into the "Confirm Password" field. */
  async fillConfirmPassword(password: string): Promise<void> {
    await this.confirmPasswordInput.fill(password);
  }

  /** Clicks the submit button. */
  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /**
   * Fills both password fields and submits the form in one step.
   * Returns after the click; callers should assert the outcome.
   */
  async resetPassword(password: string, confirmPassword?: string): Promise<void> {
    await this.fillPassword(password);
    await this.fillConfirmPassword(confirmPassword ?? password);
    await this.submit();
  }

  /** Waits for the inline error message to appear and be visible. */
  async waitForError(): Promise<void> {
    await this.errorMessage.waitFor({ state: 'visible' });
  }

  /** Waits for the token-missing error element to appear and be visible. */
  async waitForTokenError(): Promise<void> {
    await this.tokenMissingError.waitFor({ state: 'visible' });
  }

  /** Waits for the success message to appear and be visible. */
  async waitForSuccess(): Promise<void> {
    await this.successMessage.waitFor({ state: 'visible' });
  }
}
