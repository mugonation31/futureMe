import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * SettingsPage encapsulates selectors and actions for the /settings route.
 *
 * The settings page is only reachable when both authGuard and householdGuard pass.
 *
 * Selector rationale
 * ------------------
 *  - getByRole('heading')     — the H1 "Settings" heading; resilient to class changes.
 *  - getByLabel()             — preferred for form fields; ties to the <label> element.
 *  - getByRole('button')      — matches the submit button by its accessible name.
 *  - `.success-message`       — conditionally rendered success banner (task 28).
 *  - `.error-message`         — conditionally rendered error banner.
 *  - `.settings-container`    — top-level wrapper; stable class used as loaded sentinel.
 */
export class SettingsPage extends BasePage {
  readonly container: Locator;
  readonly heading: Locator;

  // Form fields
  readonly displayNameInput: Locator;
  readonly currencySelect: Locator;
  readonly monthlyBudgetInput: Locator;

  // Actions
  readonly saveButton: Locator;

  // Feedback banners (task 28)
  readonly successMessage: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.container          = page.locator('.settings-container');
    this.heading            = page.getByRole('heading', { name: 'Settings', level: 1 });

    // Form fields — matched by their <label> text so they survive HTML restructuring.
    this.displayNameInput   = page.getByLabel('Display Name');
    this.currencySelect     = page.getByLabel('Currency');
    this.monthlyBudgetInput = page.getByLabel('Monthly Budget');

    // Submit button — by accessible name (matches both "Save Settings" and "Saving...").
    this.saveButton         = page.getByRole('button', { name: /Save Settings|Saving/ });

    // Banners
    this.successMessage     = page.locator('.success-message');
    this.errorMessage       = page.locator('.error-message');
  }

  override async goto() {
    await super.goto('/settings');
  }

  /** True when the settings container is visible. */
  async isLoaded(): Promise<boolean> {
    return this.container.isVisible();
  }

  /**
   * Fills in and submits the settings form with the supplied values.
   * Pass undefined for any field you do not want to touch.
   */
  async saveSettings(opts: {
    displayName?: string;
    currency?: string;
    monthlyBudget?: number;
  }): Promise<void> {
    if (opts.displayName !== undefined) {
      await this.displayNameInput.fill(opts.displayName);
    }
    if (opts.currency !== undefined) {
      await this.currencySelect.selectOption(opts.currency);
    }
    if (opts.monthlyBudget !== undefined) {
      await this.monthlyBudgetInput.fill(String(opts.monthlyBudget));
    }
    await this.saveButton.click();
  }

  /**
   * Waits for the success message to appear, then waits for it to disappear
   * (auto-dismiss after ~3 s, task 28).  Returns the message text captured
   * before it disappears.
   */
  async waitForSuccessAutoDismiss(timeoutMs = 6000): Promise<string> {
    await this.successMessage.waitFor({ state: 'visible', timeout: timeoutMs });
    const text = (await this.successMessage.textContent()) ?? '';
    await this.successMessage.waitFor({ state: 'hidden', timeout: timeoutMs });
    return text;
  }
}
