import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * DashboardPage encapsulates selectors and assertions for the /dashboard route.
 *
 * The dashboard is only reachable when both authGuard and householdGuard pass,
 * so this page object is also used in guard-redirect tests simply to verify
 * that the URL is (or is not) /dashboard.
 *
 * Selector rationale
 * ------------------
 *  - getByRole('heading')        — the H1 "Dashboard" heading; resilient to class changes.
 *  - `.dashboard-container`      — top-level wrapper class; stable BEM class used as
 *                                  the "page loaded" sentinel.
 *  - `.loading`                  — temporary loading state paragraph.
 *  - `.error-message`            — error paragraph (when stats API fails).
 *  - `.stats-grid`               — the four stat-card wrapper.
 *  - `[data-testid="stat-card"]` — individual stat cards (explicit testid from template).
 *  - `[data-testid="stat-remaining"]` — remaining budget value (task 27: never negative).
 *  - `[data-testid="zero-budget-cta"]` — CTA shown when total_budget === 0.
 *  - `[data-testid="empty-transactions"]` — CTA shown when no transactions this month.
 *  - `[data-testid="category-row"]`  — one row per category in the breakdown section.
 *  - `.category-name` / `.category-spent` — cells within each category row.
 *  - `.progress-bar-fill`        — the coloured progress bar within each row.
 *  - `.breakdown-section`        — wrapper for the category breakdown.
 */
export class DashboardPage extends BasePage {
  readonly container: Locator;
  readonly heading: Locator;
  readonly loadingIndicator: Locator;
  readonly errorMessage: Locator;
  readonly statsGrid: Locator;

  // Stat cards
  readonly statCards: Locator;
  readonly statRemaining: Locator;

  // Dashboard content (visible once loading completes)
  readonly dashboardContent: Locator;

  // Zero-budget CTA (task 27)
  readonly zeroBudgetCta: Locator;
  readonly zeroBudgetLink: Locator;

  // Empty-transactions CTA (task 27)
  readonly emptyTransactionsCta: Locator;
  readonly emptyTransactionsLink: Locator;

  // Category breakdown (task 27)
  readonly breakdownSection: Locator;
  readonly categoryRows: Locator;

  // Category breakdown empty state (task 34)
  readonly categoryEmptyState: Locator;
  readonly categoryEmptyStateLink: Locator;

  constructor(page: Page) {
    super(page);
    this.container          = page.locator('.dashboard-container');
    this.heading            = page.getByRole('heading', { name: 'Dashboard', level: 1 });
    this.loadingIndicator   = page.locator('.loading');
    this.errorMessage       = page.locator('.error-message');
    this.statsGrid          = page.locator('.stats-grid');

    this.statCards          = page.locator('[data-testid="stat-card"]');
    this.statRemaining      = page.locator('[data-testid="stat-remaining"]');

    this.dashboardContent   = page.locator('.dashboard-content');

    this.zeroBudgetCta      = page.locator('[data-testid="zero-budget-cta"]');
    this.zeroBudgetLink     = page.locator('[data-testid="zero-budget-cta"] a');

    this.emptyTransactionsCta   = page.locator('[data-testid="empty-transactions"]');
    this.emptyTransactionsLink  = page.locator('[data-testid="empty-transactions"] a');

    this.breakdownSection   = page.locator('.breakdown-section');
    this.categoryRows       = page.locator('[data-testid="category-row"]');

    // Empty state shown when category_breakdown is empty (task 34)
    this.categoryEmptyState     = page.locator('[data-testid="category-empty-state"]');
    this.categoryEmptyStateLink = page.locator('[data-testid="category-empty-state"] a');
  }

  override async goto() {
    await super.goto('/dashboard');
  }

  /** True when the container is visible — does not imply stats have loaded. */
  async isLoaded(): Promise<boolean> {
    return this.container.isVisible();
  }

  /**
   * Returns the text content of the Remaining budget stat card value.
   * Useful for asserting the value is never negative (task 27).
   */
  async getRemainingText(): Promise<string> {
    return (await this.statRemaining.textContent()) ?? '';
  }

  /**
   * Returns the locator for the category name cell within a specific row
   * (0-indexed).
   */
  categoryName(index: number): Locator {
    return this.categoryRows.nth(index).locator('.category-name');
  }

  /**
   * Returns the locator for the spent amount cell within a specific row.
   */
  categorySpent(index: number): Locator {
    return this.categoryRows.nth(index).locator('.category-spent');
  }

  /**
   * Returns the locator for the progress bar fill within a specific row.
   * Uses the CSS class selector for backwards compatibility with existing tests.
   */
  categoryProgressBar(index: number): Locator {
    return this.categoryRows.nth(index).locator('.progress-bar-fill');
  }

  /**
   * Returns the locator for the progress bar fill using the data-testid
   * attribute (task 34 — preferred selector for new tests).
   */
  categoryProgressFill(index: number): Locator {
    return this.categoryRows.nth(index).locator('[data-testid="category-progress-fill"]');
  }

  /**
   * Returns the locator for the budget limit cell within a specific row.
   * Shows a formatted currency value when a budget is set, or "No limit".
   */
  categoryBudgetCell(index: number): Locator {
    return this.categoryRows.nth(index).locator('.category-budget');
  }
}
