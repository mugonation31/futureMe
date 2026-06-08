/**
 * TransactionsPage
 *
 * Page Object for the /transactions UI route.
 * Encapsulates all selectors and actions for TransactionListComponent and
 * the inline TransactionFormComponent.
 *
 * All selectors use data-testid attributes that are already present in the
 * Angular templates (data-testid="month-selector", "add-transaction-btn",
 * "transaction-form", "transaction-row", "delete-btn", "amount-input",
 * "type-select", "category-select", "description-input", "date-input",
 * "submit-btn").
 */

import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal, non-expiring JWT so the Angular authGuard considers the
 * browser session authenticated without a real Supabase backend.
 *
 * The payload carries the fields that AuthService.loadUserFromToken() reads:
 *   sub, email, display_name, exp (set to year 2099 so it never expires).
 */
export function buildFakeToken(userId = 'test-user-id', email = 'e2e@futureme-test.example.com'): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '');
  const exp = Math.floor(new Date('2099-01-01').getTime() / 1000);
  const payload = btoa(
    JSON.stringify({ sub: userId, email, display_name: 'E2E User', exp }),
  ).replace(/=/g, '');
  const signature = 'fakesignature';
  return `${header}.${payload}.${signature}`;
}

// ---------------------------------------------------------------------------
// TransactionsPage
// ---------------------------------------------------------------------------

export class TransactionsPage extends BasePage {
  // ---- List controls --------------------------------------------------------
  readonly monthSelector: Locator;
  readonly addTransactionBtn: Locator;

  // ---- Inline form ----------------------------------------------------------
  readonly transactionForm: Locator;
  readonly amountInput: Locator;
  readonly typeSelect: Locator;
  readonly categorySelect: Locator;
  readonly descriptionInput: Locator;
  readonly dateInput: Locator;
  readonly submitBtn: Locator;
  readonly formErrorMessage: Locator;

  // ---- Transaction table ----------------------------------------------------
  readonly transactionRows: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page);
    // List controls
    this.monthSelector   = page.getByTestId('month-selector');
    this.addTransactionBtn = page.getByTestId('add-transaction-btn');

    // Inline form
    this.transactionForm    = page.getByTestId('transaction-form');
    this.amountInput        = page.getByTestId('amount-input');
    this.typeSelect         = page.getByTestId('type-select');
    this.categorySelect     = page.getByTestId('category-select');
    this.descriptionInput   = page.getByTestId('description-input');
    this.dateInput          = page.getByTestId('date-input');
    this.submitBtn          = page.getByTestId('submit-btn');
    this.formErrorMessage   = page.locator('app-transaction-form p.error');

    // Table
    this.transactionRows = page.getByTestId('transaction-row');
    this.errorMessage    = page.locator('.error-message');
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  /** Navigate to /transactions without injecting auth — used for redirect tests. */
  async goto(): Promise<void> {
    await this.page.goto('/transactions');
  }

  /**
   * Inject a fake JWT into localStorage so authGuard and householdGuard pass,
   * then navigate to /transactions.
   *
   * We first navigate to the app origin (/) so that localStorage is accessible
   * on the correct origin, then write the token, then navigate to /transactions.
   *
   * householdGuard calls GET /api/households/me on first navigation when
   * currentHousehold$ is null.  The caller must have intercepted that request
   * before calling this method (or it will fall through to /onboarding).
   */
  async gotoAuthenticated(token: string): Promise<void> {
    // Navigate to the app root first so we are on the right origin
    await this.page.goto('/');
    // Now localStorage is accessible for this origin
    await this.page.evaluate(
      (t: string) => localStorage.setItem('fm_access_token', t),
      token,
    );
    await this.page.goto('/transactions');
  }

  // ---------------------------------------------------------------------------
  // Form actions
  // ---------------------------------------------------------------------------

  async toggleForm(): Promise<void> {
    await this.addTransactionBtn.click();
  }

  async fillAmount(value: string): Promise<void> {
    await this.amountInput.fill(value);
  }

  async selectType(value: 'expense' | 'income'): Promise<void> {
    await this.typeSelect.selectOption(value);
  }

  async fillDescription(value: string): Promise<void> {
    await this.descriptionInput.fill(value);
  }

  async fillDate(value: string): Promise<void> {
    await this.dateInput.fill(value);
  }

  /** Click Submit and optionally touch the amount field first to trigger validation. */
  async submitForm(): Promise<void> {
    await this.submitBtn.click();
  }

  /** Touch the amount field (focus then blur) to trigger Angular touched state. */
  async touchAmountField(): Promise<void> {
    await this.amountInput.focus();
    await this.amountInput.blur();
  }

  // ---------------------------------------------------------------------------
  // Month selector
  // ---------------------------------------------------------------------------

  async selectMonth(value: string): Promise<void> {
    await this.monthSelector.selectOption(value);
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  /** Click the delete button of the nth transaction row (0-indexed). */
  async deleteTransactionAt(index = 0): Promise<void> {
    await this.transactionRows.nth(index).getByTestId('delete-btn').click();
  }

  // ---------------------------------------------------------------------------
  // Assertions
  // ---------------------------------------------------------------------------

  async isLoaded(): Promise<void> {
    await expect(this.page).toHaveURL(/\/transactions/);
    await expect(this.monthSelector).toBeVisible();
    await expect(this.addTransactionBtn).toBeVisible();
  }

  async formIsVisible(): Promise<boolean> {
    return this.transactionForm.isVisible();
  }

  async submitIsDisabled(): Promise<boolean> {
    return this.submitBtn.isDisabled();
  }

  async amountErrorIsVisible(): Promise<void> {
    // The error span for the amount field — "Amount must be greater than 0"
    await expect(
      this.page.locator('[data-testid="transaction-form"] .error').first(),
    ).toBeVisible();
  }
}
