import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * SettingsPage encapsulates selectors and actions for the /settings route.
 *
 * The settings page is only reachable when both authGuard and householdGuard pass.
 *
 * Selector rationale
 * ------------------
 *  - getByRole('heading')           — the H1 "Settings" heading; resilient to class changes.
 *  - getByLabel()                   — preferred for form fields; ties to the <label> element.
 *  - getByRole('button')            — matches submit buttons by their accessible name.
 *  - `.success-banner`              — conditionally rendered success banner (task 28).
 *  - `.error-banner`                — conditionally rendered error banner.
 *  - `.settings-container`          — top-level wrapper; stable class used as loaded sentinel.
 *  - `app-budget-allocation`        — host element for the embedded BudgetAllocationComponent.
 *  - `.loading-message`             — shown while category + budget data loads (task 33).
 *  - `.budget-row`                  — one row per category in the budget allocation panel.
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

  // ── Budget Allocation panel (Task 33) ─────────────────────────────────────────

  /** Host element for app-budget-allocation; stable anchor for scoped queries. */
  readonly budgetPanel: Locator;

  /** "Category Budgets" section heading inside the panel. */
  readonly budgetPanelHeading: Locator;

  /** Loading spinner/message shown while forkJoin(categories, budgets) is in flight. */
  readonly budgetLoadingMessage: Locator;

  /** All budget rows (one per category). */
  readonly budgetRows: Locator;

  /** Save Budgets button (or "Saving…" when saving is in progress). */
  readonly saveBudgetsButton: Locator;

  /**
   * Success banner inside the budget panel.
   * Note: the component uses the same `.success-message` class as the outer
   * settings page so we scope it to the budget panel host element.
   */
  readonly budgetSuccessMessage: Locator;

  /**
   * Error banner inside the budget panel.
   * Scoped to app-budget-allocation to avoid colliding with the outer
   * settings-page error banner.
   */
  readonly budgetErrorMessage: Locator;

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

    // Banners — the settings-page template renders these as .success-banner /
    // .error-banner (see settings-page.component.html).
    this.successMessage     = page.locator('.success-banner');
    this.errorMessage       = page.locator('.error-banner');

    // Budget allocation panel — scoped to the component host element.
    this.budgetPanel            = page.locator('app-budget-allocation');
    this.budgetPanelHeading     = this.budgetPanel.getByRole('heading', { name: 'Category Budgets' });
    this.budgetLoadingMessage   = this.budgetPanel.locator('.loading-message');
    this.budgetRows             = this.budgetPanel.locator('.budget-row');
    this.saveBudgetsButton      = this.budgetPanel.getByRole('button', { name: /Save Budgets|Saving/ });
    this.budgetSuccessMessage   = this.budgetPanel.locator('.success-message');
    this.budgetErrorMessage     = this.budgetPanel.locator('.error-message');
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

  // ── Budget Allocation helpers (Task 33) ───────────────────────────────────────

  /**
   * Returns the nth budget row (0-indexed) inside the budget allocation panel.
   * Each row contains a label (category name) and a number input.
   */
  budgetRow(index: number): Locator {
    return this.budgetRows.nth(index);
  }

  /**
   * Returns the number input within the nth budget row.
   */
  budgetRowInput(index: number): Locator {
    return this.budgetRow(index).locator('input[type="number"]');
  }

  /**
   * Returns the label text of the nth budget row (the category name).
   */
  async budgetRowCategoryName(index: number): Promise<string> {
    return (await this.budgetRow(index).locator('.form-label').textContent()) ?? '';
  }

  /**
   * Waits until the budget panel finishes loading (loading message gone
   * and at least one budget row is visible).
   */
  async waitForBudgetPanelLoaded(timeoutMs = 10000): Promise<void> {
    await this.budgetLoadingMessage.waitFor({ state: 'hidden', timeout: timeoutMs });
  }
}
