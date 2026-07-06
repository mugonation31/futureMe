import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * DashboardPage — root E2E page object for /dashboard.
 *
 * Selector rationale
 * ------------------
 *  - `.dashboard-container` — stable top-level wrapper, used as "page loaded" sentinel.
 *  - `.loading`             — in-flight loading paragraph; wait for it to disappear.
 *  - `.error-text`          — error paragraph rendered when the stats API fails.
 *  - `.card`                — each summary card (Net Position, Total Debt, etc.).
 *  - `.label`               — the card title paragraph inside each card.
 *  - `.amount`              — the formatted currency/number value inside each card.
 *
 * The "Net Position" card is the user-visible surface that reflects
 * `total_expenses` (net_position = total_income − total_expenses).  Task 12
 * changed how `total_expenses` is computed on the backend; these selectors let
 * the spec assert the correct value reaches the UI.
 */
export class DashboardPage extends BasePage {
  /** Top-level container — visible once Angular has rendered the route. */
  readonly container: Locator;

  /** Loading indicator paragraph — present while the API call is in flight. */
  readonly loadingIndicator: Locator;

  /** Error message paragraph — present when the stats API returns an error. */
  readonly errorText: Locator;

  /**
   * The "Net Position" card heading (`<p class="label">Net Position</p>`).
   * Used to locate the card by its visible text label.
   */
  readonly netPositionLabel: Locator;

  /**
   * The formatted currency value displayed inside the "Net Position" card.
   * This is the primary assertion target for Task 12 tests: recurring expenses
   * from prior months increase `total_expenses`, which reduces `net_position`.
   */
  readonly netPositionAmount: Locator;

  constructor(page: Page) {
    super(page);
    this.container          = page.locator('.dashboard-container');
    this.loadingIndicator   = page.locator('.loading');
    this.errorText          = page.locator('.error-text');

    // Locate the Net Position card by its visible label text, then get the
    // sibling `.amount` element.  This is resilient to card ordering changes.
    this.netPositionLabel   = page.locator('.card .label', { hasText: 'Net Position' });
    this.netPositionAmount  = page.locator('.card', { has: page.locator('.label', { hasText: 'Net Position' }) })
                                   .locator('.amount');
  }

  async goto() {
    await this.page.goto('/dashboard');
  }

  async isLoaded() {
    await expect(this.page).toHaveURL(/\/dashboard/);
  }

  /**
   * Waits until the loading indicator is gone and the dashboard content has
   * rendered.  Use this after goto() in any test that asserts on dashboard
   * data rather than the loading/error states.
   */
  async waitForStats(timeoutMs = 15_000): Promise<void> {
    await this.loadingIndicator.waitFor({ state: 'hidden', timeout: timeoutMs });
  }

  /**
   * Returns the text content of the Net Position amount element, trimmed.
   */
  async getNetPositionText(): Promise<string> {
    return (await this.netPositionAmount.textContent())?.trim() ?? '';
  }
}
