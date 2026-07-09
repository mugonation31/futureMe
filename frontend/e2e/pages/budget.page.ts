import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * BudgetPage encapsulates selectors for the /budget route — the post-auth
 * landing screen introduced when the money-era dashboard was retired (Task 27).
 *
 * In Task 27 this is a minimal placeholder ("Budget — coming soon"); the real
 * Intentional Spending Tracker UI is built out in Tasks 28/29, at which point
 * this page object grows with it.
 *
 * Selector rationale
 * ------------------
 *  - getByRole('heading', { name: 'Budget' }) — the H1 heading, resilient to
 *    class changes.
 *  - `.budget-page` — top-level wrapper class used as the "page loaded" sentinel.
 */
export class BudgetPage extends BasePage {
  readonly container: Locator;
  readonly heading: Locator;

  constructor(page: Page) {
    super(page);
    this.container = page.locator('.budget-page');
    this.heading   = page.getByRole('heading', { name: 'Budget', level: 1 });
  }

  override async goto() {
    await super.goto('/budget');
  }
}
