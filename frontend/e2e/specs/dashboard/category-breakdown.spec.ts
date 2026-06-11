import { test, expect } from '@playwright/test';
import { DashboardPage } from '../../pages/dashboard.page';
import { buildFakeJwt, seedAuthToken } from '../../utils/auth';

/**
 * Dashboard — Category Breakdown E2E tests (Task 34)
 * ====================================================
 *
 * Covers the "Spending by Category" section added in Task 34:
 *
 *   1. Category rows render — names and spent amounts visible
 *   2. Progress bar fill width — [style.width.%] matches spent/budget ratio
 *   3. over-budget class — applied when spent >= 90% of budget
 *   4. "No limit" text — shown when budget is null
 *   5. Empty-state card — shown when category_breakdown is empty, links to /transactions
 *   6. No-household user — dashboard renders with zeroed stats
 *
 * All tests mock the backend via page.route() — no live backend required.
 * The Angular dev server must be running on E2E_BASE_URL (default: 4202).
 *
 * Port: 4202 (configured in frontend/e2e/.env → E2E_BASE_URL).
 *
 * Selector strategy: all selectors live in DashboardPage.  Specs never contain
 * raw CSS strings or DOM queries.
 *
 * Run only this project with:
 *   npx playwright test --project=category-breakdown
 */

// ─── shared constants ────────────────────────────────────────────────────────

const apiUrl = process.env['E2E_API_URL'] ?? 'http://localhost:8002/api';

const MOCK_HOUSEHOLD = {
  id: 'hh-e2e',
  name: 'E2E Household',
  invite_code: 'TEST-CODE',
};

/** Inject a fake JWT + stub /households/me so protected routes are reachable. */
async function stubAuth(page: import('@playwright/test').Page): Promise<void> {
  const token = buildFakeJwt({ email: 'e2e@example.com' });
  await page.goto('/');
  await seedAuthToken(page, token);
  await page.route(`${apiUrl}/households/me`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_HOUSEHOLD),
    })
  );
}

/** Stub /api/settings with the given currency (defaults to GBP). */
async function stubSettings(
  page: import('@playwright/test').Page,
  currency = 'GBP',
  monthlyBudget = 2000
): Promise<void> {
  await page.route(`${apiUrl}/settings`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ currency, monthly_budget: monthlyBudget }),
    })
  );
}

/** Stub /api/dashboard with the provided category_breakdown array. */
async function stubDashboard(
  page: import('@playwright/test').Page,
  categoryBreakdown: Array<{ category_name: string; spent: number; budget: number | null }>,
  totalBudget = 2000,
  totalSpent?: number
): Promise<void> {
  const spent = totalSpent ?? categoryBreakdown.reduce((sum, r) => sum + r.spent, 0);
  await page.route(`${apiUrl}/dashboard`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total_budget: totalBudget,
        total_spent: spent,
        remaining_budget: Math.max(0, totalBudget - spent),
        savings_rate: totalBudget > 0 ? ((totalBudget - spent) / totalBudget) * 100 : 0,
        category_breakdown: categoryBreakdown,
      }),
    })
  );
}

// ─── 1. Category rows render ─────────────────────────────────────────────────

test.describe('Dashboard — category breakdown rows (Task 34)', () => {
  test.beforeEach(async ({ page }) => {
    await stubAuth(page);
    await stubSettings(page);
    await stubDashboard(page, [
      { category_name: 'Groceries', spent: 400, budget: 600 },
      { category_name: 'Transport', spent: 150, budget: 300 },
      { category_name: 'Entertainment', spent: 80, budget: null },
    ]);
  });

  test('renders one category-row for each item in category_breakdown', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.dashboardContent).toBeVisible();
    await expect(dashboard.categoryRows).toHaveCount(3);
  });

  test('each category row shows the correct category name', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.dashboardContent).toBeVisible();
    await expect(dashboard.categoryName(0)).toHaveText('Groceries');
    await expect(dashboard.categoryName(1)).toHaveText('Transport');
    await expect(dashboard.categoryName(2)).toHaveText('Entertainment');
  });

  test('each category row shows the spent amount formatted with a currency symbol', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.dashboardContent).toBeVisible();
    // GBP currency — amounts must include the £ symbol.
    await expect(dashboard.categorySpent(0)).toContainText('£');
    await expect(dashboard.categorySpent(0)).toContainText('400');
    await expect(dashboard.categorySpent(1)).toContainText('150');
    await expect(dashboard.categorySpent(2)).toContainText('80');
  });

  test('each category row contains a progress-bar-fill element', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.dashboardContent).toBeVisible();
    for (let i = 0; i < 3; i++) {
      await expect(dashboard.categoryProgressFill(i)).toBeAttached();
    }
  });
});

// ─── 2. Progress bar fill width ──────────────────────────────────────────────

test.describe('Dashboard — progress bar fill width (Task 34)', () => {
  test.beforeEach(async ({ page }) => {
    await stubAuth(page);
    await stubSettings(page);
  });

  test('progress fill width is proportional to spent/budget ratio (50%)', async ({ page }) => {
    await stubDashboard(page, [
      { category_name: 'Groceries', spent: 300, budget: 600 },
    ]);

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.dashboardContent).toBeVisible();

    // spent=300, budget=600 → width should be 50%.
    // Angular binds [style.width.%] directly so we read the inline style.
    const fill = dashboard.categoryProgressFill(0);
    await expect(fill).toBeAttached();

    const widthStyle = await fill.evaluate((el: HTMLElement) => el.style.width);
    // The style.width.% binding produces values like "50%" or "50.0%".
    const widthValue = parseFloat(widthStyle);
    expect(widthValue).toBeCloseTo(50, 1);
  });

  test('progress fill width is capped at 100% when spent exceeds budget', async ({ page }) => {
    await stubDashboard(page, [
      // spent 800 vs budget 500 → raw ratio 160% but capped at 100%.
      { category_name: 'Rent', spent: 800, budget: 500 },
    ]);

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.dashboardContent).toBeVisible();

    const fill = dashboard.categoryProgressFill(0);
    const widthStyle = await fill.evaluate((el: HTMLElement) => el.style.width);
    const widthValue = parseFloat(widthStyle);
    expect(widthValue).toBeLessThanOrEqual(100);
    expect(widthValue).toBeGreaterThanOrEqual(99); // clamped to 100
  });

  test('progress fill width is 0% when budget is null', async ({ page }) => {
    await stubDashboard(page, [
      { category_name: 'Entertainment', spent: 200, budget: null },
    ]);

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.dashboardContent).toBeVisible();

    // getCategoryBarWidth returns 0 when budget is null.
    const fill = dashboard.categoryProgressFill(0);
    const widthStyle = await fill.evaluate((el: HTMLElement) => el.style.width);
    const widthValue = parseFloat(widthStyle);
    expect(widthValue).toBe(0);
  });

  test('progress fill width is 0% when budget is 0', async ({ page }) => {
    await stubDashboard(page, [
      { category_name: 'Shopping', spent: 50, budget: 0 },
    ]);

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.dashboardContent).toBeVisible();

    const fill = dashboard.categoryProgressFill(0);
    const widthStyle = await fill.evaluate((el: HTMLElement) => el.style.width);
    const widthValue = parseFloat(widthStyle);
    expect(widthValue).toBe(0);
  });
});

// ─── 3. over-budget class ─────────────────────────────────────────────────────

test.describe('Dashboard — over-budget class on progress fill (Task 34)', () => {
  test.beforeEach(async ({ page }) => {
    await stubAuth(page);
    await stubSettings(page);
  });

  test('over-budget class is applied when spent is exactly 90% of budget', async ({ page }) => {
    await stubDashboard(page, [
      // 450 / 500 = exactly 90%  → over-budget
      { category_name: 'Bills', spent: 450, budget: 500 },
    ]);

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.dashboardContent).toBeVisible();
    await expect(dashboard.categoryProgressFill(0)).toHaveClass(/over-budget/);
  });

  test('over-budget class is applied when spent exceeds 90% of budget', async ({ page }) => {
    await stubDashboard(page, [
      // 480 / 500 = 96%  → over-budget
      { category_name: 'Utilities', spent: 480, budget: 500 },
    ]);

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.dashboardContent).toBeVisible();
    await expect(dashboard.categoryProgressFill(0)).toHaveClass(/over-budget/);
  });

  test('over-budget class is applied when spent equals budget (100%)', async ({ page }) => {
    await stubDashboard(page, [
      // 500 / 500 = 100%  → over-budget
      { category_name: 'Subscriptions', spent: 500, budget: 500 },
    ]);

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.dashboardContent).toBeVisible();
    await expect(dashboard.categoryProgressFill(0)).toHaveClass(/over-budget/);
  });

  test('over-budget class is NOT applied when spent is below 90% of budget', async ({ page }) => {
    await stubDashboard(page, [
      // 400 / 500 = 80%  → not over-budget
      { category_name: 'Groceries', spent: 400, budget: 500 },
    ]);

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.dashboardContent).toBeVisible();
    await expect(dashboard.categoryProgressFill(0)).not.toHaveClass(/over-budget/);
  });

  test('over-budget class is NOT applied when budget is null', async ({ page }) => {
    await stubDashboard(page, [
      // No budget set — isCategoryAtLimit returns false
      { category_name: 'Entertainment', spent: 999, budget: null },
    ]);

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.dashboardContent).toBeVisible();
    await expect(dashboard.categoryProgressFill(0)).not.toHaveClass(/over-budget/);
  });

  test('correct rows have over-budget class when multiple categories are shown', async ({ page }) => {
    await stubDashboard(page, [
      { category_name: 'Groceries',      spent: 400, budget: 500 },   // 80%  — normal
      { category_name: 'Transport',      spent: 460, budget: 500 },   // 92%  — over-budget
      { category_name: 'Entertainment',  spent: 100, budget: null },  // null — normal
      { category_name: 'Utilities',      spent: 500, budget: 500 },   // 100% — over-budget
    ]);

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.dashboardContent).toBeVisible();

    // Row 0 (80%) — no over-budget class
    await expect(dashboard.categoryProgressFill(0)).not.toHaveClass(/over-budget/);
    // Row 1 (92%) — over-budget
    await expect(dashboard.categoryProgressFill(1)).toHaveClass(/over-budget/);
    // Row 2 (null) — no over-budget class
    await expect(dashboard.categoryProgressFill(2)).not.toHaveClass(/over-budget/);
    // Row 3 (100%) — over-budget
    await expect(dashboard.categoryProgressFill(3)).toHaveClass(/over-budget/);
  });
});

// ─── 4. "No limit" text ───────────────────────────────────────────────────────

test.describe('Dashboard — budget limit cell (Task 34)', () => {
  test.beforeEach(async ({ page }) => {
    await stubAuth(page);
    await stubSettings(page);
  });

  test('shows "No limit" when budget is null', async ({ page }) => {
    await stubDashboard(page, [
      { category_name: 'Entertainment', spent: 75, budget: null },
    ]);

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.dashboardContent).toBeVisible();
    await expect(dashboard.categoryBudgetCell(0)).toHaveText('No limit');
  });

  test('shows formatted currency amount when budget is set', async ({ page }) => {
    await stubDashboard(page, [
      { category_name: 'Groceries', spent: 200, budget: 600 },
    ]);

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.dashboardContent).toBeVisible();
    // Budget of 600 with GBP currency should display £600.00
    await expect(dashboard.categoryBudgetCell(0)).toContainText('£');
    await expect(dashboard.categoryBudgetCell(0)).toContainText('600');
    await expect(dashboard.categoryBudgetCell(0)).not.toHaveText('No limit');
  });

  test('mixed rows correctly show "No limit" and formatted budget side by side', async ({ page }) => {
    await stubDashboard(page, [
      { category_name: 'Groceries',     spent: 200, budget: 400 },  // has limit
      { category_name: 'Entertainment', spent: 50,  budget: null }, // no limit
    ]);

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.dashboardContent).toBeVisible();
    await expect(dashboard.categoryBudgetCell(0)).not.toHaveText('No limit');
    await expect(dashboard.categoryBudgetCell(0)).toContainText('400');
    await expect(dashboard.categoryBudgetCell(1)).toHaveText('No limit');
  });
});

// ─── 5. Empty-state card ─────────────────────────────────────────────────────

test.describe('Dashboard — category breakdown empty state (Task 34)', () => {
  test.beforeEach(async ({ page }) => {
    await stubAuth(page);
    await stubSettings(page);
  });

  test('shows the empty-state card when category_breakdown is empty', async ({ page }) => {
    await stubDashboard(page, [], 1000, 0);

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.dashboardContent).toBeVisible();
    await expect(dashboard.categoryEmptyState).toBeVisible();
  });

  test('empty-state card contains a link to /transactions', async ({ page }) => {
    await stubDashboard(page, [], 1000, 0);

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.dashboardContent).toBeVisible();
    await expect(dashboard.categoryEmptyStateLink).toHaveAttribute('href', /\/transactions/);
  });

  test('empty-state card is hidden when category_breakdown has items', async ({ page }) => {
    await stubDashboard(page, [
      { category_name: 'Groceries', spent: 200, budget: 400 },
    ]);

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.dashboardContent).toBeVisible();
    await expect(dashboard.categoryEmptyState).not.toBeVisible();
  });

  test('empty-state card shows alongside the "Spending by Category" heading', async ({ page }) => {
    await stubDashboard(page, [], 1500, 0);

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.dashboardContent).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Spending by Category', level: 2 })
    ).toBeVisible();
    await expect(dashboard.categoryEmptyState).toBeVisible();
  });
});

// ─── 6. No-household user (zeroed stats) ─────────────────────────────────────

test.describe('Dashboard — user with no household (zeroed stats, Task 34)', () => {
  test('dashboard renders without errors when all stats are zero', async ({ page }) => {
    const token = buildFakeJwt({ email: 'no-household@example.com' });
    await page.goto('/');
    await seedAuthToken(page, token);

    // householdGuard reads /households/me — return a minimal household so the
    // guard passes.  The zeroed stats simulate a fresh household with no data.
    await page.route(`${apiUrl}/households/me`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'hh-zero', name: 'Zero Household', invite_code: 'ZER0' }),
      })
    );

    await page.route(`${apiUrl}/settings`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ currency: 'GBP', monthly_budget: 0 }),
      })
    );

    // Simulate a household that has no categories and no transactions.
    await page.route(`${apiUrl}/dashboard`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_budget: 0,
          total_spent: 0,
          remaining_budget: 0,
          savings_rate: 0,
          category_breakdown: [],
        }),
      })
    );

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // The dashboard shell must render — no JS errors, no blank screen.
    await expect(dashboard.container).toBeVisible();
    await expect(dashboard.dashboardContent).toBeVisible();

    // No category rows, but the breakdown section still renders.
    await expect(dashboard.breakdownSection).toBeVisible();
    await expect(dashboard.categoryRows).toHaveCount(0);

    // The category empty-state card should be visible.
    await expect(dashboard.categoryEmptyState).toBeVisible();
  });

  test('stat cards show zeroed values without crashing when total_budget is 0', async ({ page }) => {
    const token = buildFakeJwt({ email: 'zero-stats@example.com' });
    await page.goto('/');
    await seedAuthToken(page, token);

    await page.route(`${apiUrl}/households/me`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'hh-zero2', name: 'Zero2', invite_code: 'ZR02' }),
      })
    );

    await page.route(`${apiUrl}/settings`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ currency: 'GBP', monthly_budget: 0 }),
      })
    );

    await page.route(`${apiUrl}/dashboard`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_budget: 0,
          total_spent: 0,
          remaining_budget: 0,
          savings_rate: 0,
          category_breakdown: [],
        }),
      })
    );

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.dashboardContent).toBeVisible();

    // All four stat cards must be in the DOM.
    await expect(dashboard.statCards).toHaveCount(4);

    // Remaining budget must not show a negative value even when zeroed.
    const remainingText = await dashboard.getRemainingText();
    expect(remainingText).not.toContain('-');
  });
});
