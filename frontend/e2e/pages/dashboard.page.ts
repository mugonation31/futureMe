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
 *  - getByRole('heading')   — the H1 "Dashboard" heading; resilient to class changes.
 *  - `.dashboard-container` — top-level wrapper class; stable BEM class used as
 *                             the "page loaded" sentinel.
 *  - `.loading`             — temporary loading state paragraph.
 *  - `.error-message`       — error paragraph (when stats API fails).
 *  - `.stats-grid`          — the four stat-card wrapper; used to assert that
 *                             budget stats are rendered once the API responds.
 */
export class DashboardPage extends BasePage {
  readonly container: Locator;
  readonly heading: Locator;
  readonly loadingIndicator: Locator;
  readonly errorMessage: Locator;
  readonly statsGrid: Locator;

  constructor(page: Page) {
    super(page);
    this.container        = page.locator('.dashboard-container');
    this.heading          = page.getByRole('heading', { name: 'Dashboard', level: 1 });
    this.loadingIndicator = page.locator('.loading');
    this.errorMessage     = page.locator('.error-message');
    this.statsGrid        = page.locator('.stats-grid');
  }

  override async goto() {
    await super.goto('/dashboard');
  }

  /** True when the container is visible — does not imply stats have loaded. */
  async isLoaded(): Promise<boolean> {
    return this.container.isVisible();
  }
}
