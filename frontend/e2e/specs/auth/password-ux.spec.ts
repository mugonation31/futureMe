import { test, expect } from '@playwright/test';
import { PasswordUxPage } from '../../pages/password-ux.page';

/**
 * SEC-2 — Password complexity validation + show/hide toggle E2E tests
 * ====================================================================
 *
 * Covers the password UX changes shipped in SEC-2 across all three auth
 * routes that contain password fields:
 *
 *   /login           — single password field with a show/hide toggle
 *   /signup          — two independent toggles, password-rules hint list,
 *                      and client-side complexity validation on submit
 *   /reset-password  — two independent toggles and password-rules hint list
 *
 * Network strategy
 * ----------------
 * The only test group that triggers an API call is "Signup — complexity
 * enforced on submit".  Those tests exercise the *client-side* validation
 * path in SignupComponent.validateForm(), which never reaches the network —
 * so no page.route() mocks are needed for them.
 *
 * All other test groups are purely DOM-interaction checks: they navigate to
 * a public route, interact with inputs and toggle buttons, and assert element
 * state.  No network requests are issued.
 *
 * Selector strategy
 * -----------------
 * All selectors live in PasswordUxPage.  This spec contains no raw CSS
 * strings or DOM queries.
 *
 * Port: uses the project's baseURL (auth-pages project → 4200 by default).
 */

// ── 1. Login — show/hide toggle ───────────────────────────────────────────────

test.describe('Login — password show/hide toggle', () => {
  /**
   * The LoginComponent initialises showPassword as an empty Record<string, boolean>.
   * Before any click, showPassword['password'] is undefined, which is falsy,
   * so the template renders [type]="'password'" and aria-label="Show password".
   */
  test('password field starts as type="password" (hidden)', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoLogin();

    const type = await ux.getInputType(ux.loginPasswordInput);
    expect(type).toBe('password');
  });

  test('aria-label is "Show password" when the field is hidden', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoLogin();

    const label = await ux.getToggleAriaLabel(ux.loginPasswordToggle);
    expect(label).toBe('Show password');
  });

  test('clicking the toggle once changes the field to type="text" (visible)', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoLogin();

    await ux.loginPasswordToggle.click();

    const type = await ux.getInputType(ux.loginPasswordInput);
    expect(type).toBe('text');
  });

  test('aria-label changes to "Hide password" after the first toggle click', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoLogin();

    await ux.loginPasswordToggle.click();

    const label = await ux.getToggleAriaLabel(ux.loginPasswordToggle);
    expect(label).toBe('Hide password');
  });

  test('clicking the toggle a second time returns the field to type="password"', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoLogin();

    await ux.loginPasswordToggle.click();
    await ux.loginPasswordToggle.click();

    const type = await ux.getInputType(ux.loginPasswordInput);
    expect(type).toBe('password');
  });

  test('aria-label returns to "Show password" after the second toggle click', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoLogin();

    await ux.loginPasswordToggle.click();
    await ux.loginPasswordToggle.click();

    const label = await ux.getToggleAriaLabel(ux.loginPasswordToggle);
    expect(label).toBe('Show password');
  });
});

// ── 2. Signup — show/hide toggle on both fields ───────────────────────────────

test.describe('Signup — independent show/hide toggles', () => {
  /**
   * Both fields start hidden because showPassword is an empty Record.
   * Toggling one field must not affect the other — the two keys
   * ('password' and 'confirmPassword') are independent in the Record.
   */
  test('password field starts as type="password"', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoSignup();

    const type = await ux.getInputType(ux.signupPasswordInput);
    expect(type).toBe('password');
  });

  test('confirm-password field starts as type="password"', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoSignup();

    const type = await ux.getInputType(ux.signupConfirmPasswordInput);
    expect(type).toBe('password');
  });

  test('toggling the password field reveals it without affecting confirm-password', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoSignup();

    // Toggle only the primary password field.
    await ux.signupPasswordToggle.click();

    const passwordType = await ux.getInputType(ux.signupPasswordInput);
    const confirmType  = await ux.getInputType(ux.signupConfirmPasswordInput);

    expect(passwordType).toBe('text');
    expect(confirmType).toBe('password');
  });

  test('toggling the confirm-password field reveals it without affecting the password field', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoSignup();

    // Toggle only the confirm-password field.
    await ux.signupConfirmPasswordToggle.click();

    const passwordType = await ux.getInputType(ux.signupPasswordInput);
    const confirmType  = await ux.getInputType(ux.signupConfirmPasswordInput);

    expect(passwordType).toBe('password');
    expect(confirmType).toBe('text');
  });

  test('both fields can be revealed independently', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoSignup();

    await ux.signupPasswordToggle.click();
    await ux.signupConfirmPasswordToggle.click();

    const passwordType = await ux.getInputType(ux.signupPasswordInput);
    const confirmType  = await ux.getInputType(ux.signupConfirmPasswordInput);

    expect(passwordType).toBe('text');
    expect(confirmType).toBe('text');
  });
});

// ── 3. Signup — password-rules hint list ─────────────────────────────────────

test.describe('Signup — password-rules hint list', () => {
  /**
   * The rules <ul class="password-rules"> is wrapped in *ngIf="password.length > 0".
   * When the password input is empty the element is not present in the DOM.
   */
  test('hint list is NOT visible when the password field is empty', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoSignup();

    // Wait for the form to be present before asserting the rules list is absent.
    await expect(ux.signupPasswordInput).toBeVisible();
    await expect(ux.signupPasswordRules).not.toBeVisible();
  });

  test('hint list appears once the user starts typing', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoSignup();

    await ux.signupPasswordInput.fill('a');

    await expect(ux.signupPasswordRules).toBeVisible();
  });

  test('"At least 6 characters" rule gains .met class when length reaches 6', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoSignup();

    // 5 characters — rule should NOT be met yet.
    await ux.signupPasswordInput.fill('abcde');
    expect(await ux.ruleIsMet(ux.signupRuleMinLength)).toBe(false);

    // 6 characters — rule should now be met.
    await ux.signupPasswordInput.fill('abcdef');
    expect(await ux.ruleIsMet(ux.signupRuleMinLength)).toBe(true);
  });

  test('"At least one digit" rule gains .met class once a digit is typed', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoSignup();

    // No digit — rule not met.
    await ux.signupPasswordInput.fill('abcdef');
    expect(await ux.ruleIsMet(ux.signupRuleDigit)).toBe(false);

    // Add a digit — rule met.
    await ux.signupPasswordInput.fill('abcdef1');
    expect(await ux.ruleIsMet(ux.signupRuleDigit)).toBe(true);
  });

  test('"At least one special character" rule gains .met class once a special char is typed', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoSignup();

    // No special char — rule not met.
    await ux.signupPasswordInput.fill('abcdef1');
    expect(await ux.ruleIsMet(ux.signupRuleSpecial)).toBe(false);

    // Add a special character — rule met.
    await ux.signupPasswordInput.fill('abcdef1!');
    expect(await ux.ruleIsMet(ux.signupRuleSpecial)).toBe(true);
  });

  test('all three rules are met simultaneously for a fully compliant password', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoSignup();

    await ux.signupPasswordInput.fill('Secure1!');

    expect(await ux.ruleIsMet(ux.signupRuleMinLength)).toBe(true);
    expect(await ux.ruleIsMet(ux.signupRuleDigit)).toBe(true);
    expect(await ux.ruleIsMet(ux.signupRuleSpecial)).toBe(true);
  });
});

// ── 4. Signup — complexity enforced on submit ─────────────────────────────────

test.describe('Signup — client-side complexity validation on submit', () => {
  /**
   * SignupComponent.validateForm() runs entirely in the browser — no API call
   * is made when validation fails.  We submit with weak passwords and verify
   * that the inline error appears and the URL has NOT changed (user stays on
   * /signup).
   *
   * The exact error message is:
   *   "Password must contain at least one digit and one special character (e.g. !, @, #)."
   * (from signup.component.ts line 64)
   */
  test('submitting with a password that has no digit and no special char shows an inline error', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoSignup();

    // "password" — meets length requirement but has no digit and no special char.
    // The form now uses First Name + Last Name instead of the old Full Name field.
    await page.getByLabel('First Name').fill('Test');
    await page.getByLabel('Last Name').fill('User');
    await page.getByLabel('Email').fill('test@example.com');
    await ux.signupPasswordInput.fill('password');
    await ux.signupConfirmPasswordInput.fill('password');
    await ux.signupSubmitButton.click();

    await expect(ux.signupErrorMessage).toBeVisible();
    await expect(ux.signupErrorMessage).toContainText('at least one digit');
    // The user must remain on /signup — no navigation.
    expect(page.url()).toContain('/signup');
  });

  test('submitting with a password that has a digit but no special char shows an inline error', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoSignup();

    // "Password1" — meets length + digit requirements but has no special char.
    // The form now uses First Name + Last Name instead of the old Full Name field.
    await page.getByLabel('First Name').fill('Test');
    await page.getByLabel('Last Name').fill('User');
    await page.getByLabel('Email').fill('test@example.com');
    await ux.signupPasswordInput.fill('Password1');
    await ux.signupConfirmPasswordInput.fill('Password1');
    await ux.signupSubmitButton.click();

    await expect(ux.signupErrorMessage).toBeVisible();
    await expect(ux.signupErrorMessage).toContainText('at least one digit');
    expect(page.url()).toContain('/signup');
  });

  test('error message is not shown before any submit attempt', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoSignup();

    // Simply navigate to the page — no submission — error must not be present.
    await expect(ux.signupPasswordInput).toBeVisible();
    await expect(ux.signupErrorMessage).not.toBeVisible();
  });
});

// ── 5. Reset-password — show/hide toggle on both fields ──────────────────────

test.describe('Reset-password — independent show/hide toggles', () => {
  /**
   * The ResetPasswordComponent follows the same pattern as SignupComponent.
   * Both showPassword['newPassword'] and showPassword['confirmPassword'] start
   * as undefined (falsy) — both fields render as type="password".
   *
   * A valid-looking token query parameter is required to make the component
   * render the form instead of the "missing token" error state.
   */
  test('new-password field starts as type="password"', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoResetPassword();

    const type = await ux.getInputType(ux.resetNewPasswordInput);
    expect(type).toBe('password');
  });

  test('confirm-password field starts as type="password"', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoResetPassword();

    const type = await ux.getInputType(ux.resetConfirmPasswordInput);
    expect(type).toBe('password');
  });

  test('toggling the new-password field reveals it without affecting confirm-password', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoResetPassword();

    await ux.resetNewPasswordToggle.click();

    const newType     = await ux.getInputType(ux.resetNewPasswordInput);
    const confirmType = await ux.getInputType(ux.resetConfirmPasswordInput);

    expect(newType).toBe('text');
    expect(confirmType).toBe('password');
  });

  test('toggling the confirm-password field reveals it without affecting new-password', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoResetPassword();

    await ux.resetConfirmPasswordToggle.click();

    const newType     = await ux.getInputType(ux.resetNewPasswordInput);
    const confirmType = await ux.getInputType(ux.resetConfirmPasswordInput);

    expect(newType).toBe('password');
    expect(confirmType).toBe('text');
  });
});

// ── 6. Reset-password — rules hint list ──────────────────────────────────────

test.describe('Reset-password — password-rules hint list', () => {
  /**
   * The reset-password template includes the same *ngIf="newPassword.length > 0"
   * guard as signup.  The hint list is absent from the DOM until the user types.
   */
  test('hint list is NOT visible when the new-password field is empty', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoResetPassword();

    await expect(ux.resetNewPasswordInput).toBeVisible();
    await expect(ux.resetPasswordRules).not.toBeVisible();
  });

  test('hint list appears once the user starts typing in the new-password field', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoResetPassword();

    await ux.resetNewPasswordInput.fill('a');

    await expect(ux.resetPasswordRules).toBeVisible();
  });

  test('hint list shows all three rule items', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoResetPassword();

    await ux.resetNewPasswordInput.fill('x');

    const items = ux.resetPasswordRules.locator('li');
    await expect(items).toHaveCount(3);
  });

  test('typing a fully compliant password satisfies all three rules', async ({ page }) => {
    const ux = new PasswordUxPage(page);
    await ux.gotoResetPassword();

    await ux.resetNewPasswordInput.fill('Secure1!');

    const metItems = ux.resetPasswordRules.locator('li.met');
    await expect(metItems).toHaveCount(3);
  });
});
