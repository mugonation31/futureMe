import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * PasswordUxPage — page object for the SEC-2 password UX E2E tests.
 *
 * Covers show/hide toggles and password-rules hint lists across three routes:
 *   /login           — single password field with toggle
 *   /signup          — two password fields with independent toggles + rules list
 *   /reset-password  — two password fields with independent toggles + rules list
 *
 * Selector rationale
 * ------------------
 *  - getByLabel()
 *      Preferred for all password inputs; each <input> is tied to a <label>
 *      via the `for`/`id` pairing in the template.
 *
 *  - getByRole('button', { name: … })
 *      The toggle button has a dynamic `[attr.aria-label]` that reads either
 *      "Show password" or "Hide password".  Using the aria-label as the role
 *      name ties the selector directly to the accessibility contract, making
 *      it resilient to markup changes.
 *
 *      Because multiple toggle buttons can share the same label simultaneously
 *      (e.g. both fields hidden → both say "Show password"), we scope each
 *      toggle to its parent `.password-wrapper` to guarantee uniqueness.
 *
 *  - `.password-rules`
 *      The hint <ul> that appears when a password field has content.
 *      Used on /signup (password field only) and /reset-password (new password
 *      field only).  Scoped to the nearest `.form-group` parent to distinguish
 *      the new-password rules from any confirm-password wrapper.
 *
 *  - `li` within `.password-rules`
 *      Individual rule items; filtered by visible text to survive copy changes.
 *
 *  - `.error-message`
 *      Inline validation error shown when the form is submitted with a password
 *      that violates complexity rules.  The selector is shared with other error
 *      states, but for SEC-2 we only assert its text content, not its presence.
 */
export class PasswordUxPage extends BasePage {
  // ── /login locators ──────────────────────────────────────────────────────────

  /** The login page password input (labelled "Password"). */
  readonly loginPasswordInput: Locator;

  /**
   * The show/hide toggle button next to the login password field.
   * Scoped to `.password-wrapper` because the login page has only one wrapper,
   * so no additional disambiguation is needed.
   */
  readonly loginPasswordToggle: Locator;

  /** The login form's inline error element. */
  readonly loginErrorMessage: Locator;

  /** The login submit button. */
  readonly loginSubmitButton: Locator;

  // ── /signup locators ─────────────────────────────────────────────────────────

  /** Signup page password input (labelled "Password", exact match). */
  readonly signupPasswordInput: Locator;

  /** Signup page confirm-password input (labelled "Confirm Password"). */
  readonly signupConfirmPasswordInput: Locator;

  /**
   * Toggle button beside the signup password field.
   * Scoped to the first `.password-wrapper` (wraps the primary password field).
   */
  readonly signupPasswordToggle: Locator;

  /**
   * Toggle button beside the signup confirm-password field.
   * Scoped to the second `.password-wrapper` (wraps the confirm-password field).
   */
  readonly signupConfirmPasswordToggle: Locator;

  /**
   * The `.password-rules` hint list on the signup page.
   * Only rendered when `password.length > 0` (Angular *ngIf).
   */
  readonly signupPasswordRules: Locator;

  /** The "At least 6 characters" rule <li> inside the signup hint list. */
  readonly signupRuleMinLength: Locator;

  /** The "At least one digit" rule <li> inside the signup hint list. */
  readonly signupRuleDigit: Locator;

  /** The "At least one special character" rule <li> inside the signup hint list. */
  readonly signupRuleSpecial: Locator;

  /** The signup form's inline error element. */
  readonly signupErrorMessage: Locator;

  /** The signup submit button. */
  readonly signupSubmitButton: Locator;

  // ── /reset-password locators ─────────────────────────────────────────────────

  /** Reset-password page new-password input (labelled "New Password"). */
  readonly resetNewPasswordInput: Locator;

  /** Reset-password page confirm-password input (labelled "Confirm Password"). */
  readonly resetConfirmPasswordInput: Locator;

  /**
   * Toggle button beside the new-password field on /reset-password.
   * Scoped to the first `.password-wrapper` in the form.
   */
  readonly resetNewPasswordToggle: Locator;

  /**
   * Toggle button beside the confirm-password field on /reset-password.
   * Scoped to the second `.password-wrapper` in the form.
   */
  readonly resetConfirmPasswordToggle: Locator;

  /**
   * The `.password-rules` hint list on the reset-password page.
   * Only rendered when `newPassword.length > 0` (Angular *ngIf).
   */
  readonly resetPasswordRules: Locator;

  constructor(page: Page) {
    super(page);

    // ── Login ────────────────────────────────────────────────────────────────
    // `exact: true` prevents matching the "Show password" toggle button, whose
    // aria-label ("Show password") otherwise also satisfies a substring match.
    this.loginPasswordInput  = page.getByLabel('Password', { exact: true });
    this.loginPasswordToggle = page.locator('.password-wrapper .toggle-password');
    this.loginErrorMessage   = page.locator('.error-message');
    this.loginSubmitButton   = page.getByRole('button', { name: 'Login' });

    // ── Signup ───────────────────────────────────────────────────────────────
    // `exact: true` is needed to distinguish "Password" from "Confirm Password".
    this.signupPasswordInput        = page.getByLabel('Password', { exact: true });
    this.signupConfirmPasswordInput = page.getByLabel('Confirm Password');

    // There are two `.password-wrapper` divs on /signup.
    // .nth(0) → password, .nth(1) → confirmPassword.
    this.signupPasswordToggle        = page.locator('.password-wrapper .toggle-password').nth(0);
    this.signupConfirmPasswordToggle = page.locator('.password-wrapper .toggle-password').nth(1);

    this.signupPasswordRules  = page.locator('.password-rules');
    this.signupRuleMinLength  = page.locator('.password-rules li').filter({ hasText: 'At least 6 characters' });
    this.signupRuleDigit      = page.locator('.password-rules li').filter({ hasText: 'At least one digit' });
    this.signupRuleSpecial    = page.locator('.password-rules li').filter({ hasText: 'At least one special character' });

    this.signupErrorMessage  = page.locator('.error-message');
    this.signupSubmitButton  = page.getByRole('button', { name: 'Sign Up' });

    // ── Reset-password ───────────────────────────────────────────────────────
    this.resetNewPasswordInput     = page.getByLabel('New Password');
    this.resetConfirmPasswordInput = page.getByLabel('Confirm Password');

    // Same pattern: first wrapper = new password, second = confirm password.
    this.resetNewPasswordToggle     = page.locator('.password-wrapper .toggle-password').nth(0);
    this.resetConfirmPasswordToggle = page.locator('.password-wrapper .toggle-password').nth(1);

    this.resetPasswordRules = page.locator('.password-rules');
  }

  // ── Navigation helpers ───────────────────────────────────────────────────────

  /** Navigate to /login. */
  async gotoLogin(): Promise<void> {
    await super.goto('/login');
  }

  /** Navigate to /signup. */
  async gotoSignup(): Promise<void> {
    await super.goto('/signup');
  }

  /**
   * Navigate to /reset-password with a valid-looking (but fake) token so that
   * the Angular component renders the password form rather than the error state.
   */
  async gotoResetPassword(token = 'sec2-fake-reset-token'): Promise<void> {
    await super.goto(`/reset-password?token=${encodeURIComponent(token)}`);
  }

  // ── Query helpers ────────────────────────────────────────────────────────────

  /**
   * Returns the current `type` attribute of an input element.
   * Used to assert whether a password field is hidden ("password") or
   * revealed ("text").
   */
  async getInputType(input: Locator): Promise<string | null> {
    return input.getAttribute('type');
  }

  /**
   * Returns the `aria-label` attribute of a toggle button.
   * Used to verify the label toggles between "Show password" and "Hide password".
   */
  async getToggleAriaLabel(toggle: Locator): Promise<string | null> {
    return toggle.getAttribute('aria-label');
  }

  /**
   * Returns true if the given rule <li> currently has the `.met` CSS class,
   * indicating the corresponding rule has been satisfied.
   */
  async ruleIsMet(ruleLi: Locator): Promise<boolean> {
    const classes = await ruleLi.getAttribute('class');
    return (classes ?? '').split(' ').includes('met');
  }
}
