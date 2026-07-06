/**
 * Dashboard — Monthly Expenses (Task 12) E2E tests.
 *
 * REQUIRES: Docker Compose running (`docker compose up -d --build`)
 *   Backend:  http://localhost:8002
 *   Frontend: http://localhost:4202
 *
 * What Task 12 changed
 * --------------------
 * `get_monthly_expenses` now sums:
 *   - ALL `is_recurring = true` expenses (any date, including prior months)
 *   - PLUS current-month non-recurring expenses
 *
 * Previously, the dashboard only counted this calendar month's rows regardless
 * of `is_recurring`.  The dashboard's Net Position card (net_position =
 * total_income − total_expenses) therefore reflects whether recurring expenses
 * from prior months are correctly included.
 *
 * Test scenarios
 * --------------
 * 1. A recurring expense dated last month IS included in total_expenses and
 *    therefore reduces net_position on the dashboard.
 * 2. A non-recurring expense dated last month is NOT included in total_expenses
 *    and therefore does NOT reduce net_position.
 * 3. A non-recurring expense dated in the current month IS included in
 *    total_expenses and reduces net_position.
 *
 * Strategy
 * --------
 * Each test registers a brand-new user, creates a household, and seeds
 * expenses via POST /api/expenses.  The test then drives the browser to
 * /dashboard and asserts on the rendered Net Position value.
 *
 * Using fresh users per test ensures full isolation — no shared state between
 * runs, and no dependency on pre-created database fixtures.
 *
 * All tests are skipped when the backend is unreachable (Docker not running).
 *
 * Selector strategy: all selectors are encapsulated in DashboardPage.
 * This spec never contains raw CSS strings or DOM queries.
 */

import { test, expect, request as playwrightRequest } from '@playwright/test';
import { DashboardPage } from '../../pages/dashboard.page';

// ─── constants ───────────────────────────────────────────────────────────────

const API = 'http://localhost:8002/api';

/**
 * Build an absolute API URL.
 *
 * We always pass absolute URLs to Playwright's APIRequestContext because the
 * context's baseURL is set to the API root which ends in "/api" (no trailing
 * slash).  Playwright resolves relative paths by replacing everything after
 * the last "/" segment in the baseURL — so "/auth/register" resolves to
 * "http://localhost:8002/auth/register" instead of the intended
 * "http://localhost:8002/api/auth/register".  Using absolute URLs avoids that
 * ambiguity entirely.
 */
function apiUrl(path: string): string {
  // Normalise: ensure path starts with "/"
  return `${API}${path.startsWith('/') ? path : `/${path}`}`;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** ISO date string for the first day of last month (YYYY-MM-DD). */
function lastMonthDate(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

/** ISO date string for today (YYYY-MM-DD). */
function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ApiContext {
  token: string;
  householdId: string;
}

/**
 * Registers a fresh user, creates a household, and returns the Bearer token
 * and the household id.  Each call uses a unique timestamp-based email so
 * tests never collide even when run in parallel.
 */
async function seedUser(tag: string): Promise<ApiContext> {
  const ts = Date.now();
  const email = `task12-${tag}-${ts}@futureme-test.example.com`;
  const password = 'TestPassword1!';

  const ctx = await playwrightRequest.newContext();

  // 1. Register
  const regRes = await ctx.post(apiUrl('/auth/register'), {
    data: {
      email,
      password,
      first_name: 'Task12',
      last_name: tag,
    },
  });
  if (!regRes.ok()) {
    const body = await regRes.text();
    throw new Error(`Register failed (${regRes.status()}): ${body}`);
  }
  const { access_token: token } = await regRes.json();

  // 2. Create household (user has no household after registration)
  const hhRes = await ctx.post(apiUrl('/households'), {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: `Task12 ${tag} Household` },
  });
  if (!hhRes.ok()) {
    const body = await hhRes.text();
    throw new Error(`Create household failed (${hhRes.status()}): ${body}`);
  }
  const { id: householdId } = await hhRes.json();

  await ctx.dispose();

  return { token, householdId };
}

/**
 * Creates a single expense record via the API and returns the response body.
 */
async function createExpense(
  token: string,
  expense: {
    amount: number;
    date: string;
    is_recurring: boolean;
    category?: string;
    description?: string;
  }
): Promise<void> {
  const ctx = await playwrightRequest.newContext();

  const res = await ctx.post(apiUrl('/expenses'), {
    headers: { Authorization: `Bearer ${token}` },
    data: expense,
  });

  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Create expense failed (${res.status()}): ${body}`);
  }

  await ctx.dispose();
}

/**
 * Calls GET /api/dashboard with the given token and returns the parsed body.
 * Used for API-level assertions (no browser).
 */
async function getDashboardStats(token: string): Promise<{
  total_income: number;
  total_expenses: number;
  net_position: number;
}> {
  const ctx = await playwrightRequest.newContext();

  const res = await ctx.get(apiUrl('/dashboard'), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`GET /dashboard failed (${res.status()}): ${body}`);
  }

  const json = await res.json();
  await ctx.dispose();
  return json;
}

/**
 * Stores a JWT in localStorage under the key the Angular AuthService reads,
 * then navigates to /dashboard.  Because the root-level tests use the real
 * backend, the token is a genuine signed JWT issued by FastAPI — not a fake.
 */
async function loginViaStorage(
  page: import('@playwright/test').Page,
  token: string
): Promise<void> {
  // Navigate to the app root first so localStorage is scoped to the origin.
  await page.goto('/');

  await page.evaluate(
    ([key, tok]: [string, string]) => localStorage.setItem(key, tok),
    ['fm_access_token', token]
  );
}

// ─── skip guard ──────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  try {
    const ctx = await playwrightRequest.newContext();
    const res = await ctx.get('http://localhost:8002/health', { timeout: 4_000 });
    await ctx.dispose();
    if (!res.ok()) {
      test.skip(true, 'Backend /health returned non-OK — is Docker running?');
    }
  } catch {
    test.skip(true, 'Backend unreachable (ECONNREFUSED) — start Docker Compose first.');
  }
});

// ─── tests ───────────────────────────────────────────────────────────────────

/**
 * Scenario 1: Recurring expense dated last month IS counted in total_expenses.
 *
 * Before Task 12: the recurring expense would have been ignored because its
 * date falls outside the current calendar month.
 * After Task 12:  it is always included, so net_position decreases by its
 * amount even though it was entered with a prior-month date.
 */
test.describe('Dashboard — monthly expenses (Task 12)', () => {
  test('recurring expense from last month is included in total_expenses', async ({
    page,
  }) => {
    const { token } = await seedUser('recurring-prior');

    // Seed a single recurring expense dated last month (£120.00).
    await createExpense(token, {
      amount: 120.0,
      date: lastMonthDate(),
      is_recurring: true,
      category: 'Bills',
      description: 'Monthly subscription (recurring)',
    });

    // API-level assertion: total_expenses includes the recurring amount.
    const stats = await getDashboardStats(token);
    expect(stats.total_expenses).toBeCloseTo(120.0, 2);

    // No income seeded, so net_position = 0 − 120 = −120.
    // The dashboard clamps negative display to "caution" styling but does
    // NOT hide the value — it renders the raw net_position amount.
    expect(stats.net_position).toBeCloseTo(-120.0, 2);

    // UI assertion: the Net Position card shows the negative amount.
    await loginViaStorage(page, token);

    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await dashboard.waitForStats();

    const netText = await dashboard.getNetPositionText();
    // The Angular template formats with currency:'symbol':'1.0-0', so £120
    // becomes "-£120" or "−£120" depending on the locale negative format.
    // We assert the numeric value 120 is visible and is negative.
    expect(netText).toMatch(/120/);
    expect(netText).toMatch(/-|−/);
  });

  /**
   * Scenario 2: Non-recurring expense from last month is NOT counted.
   *
   * The new rule only includes current-month non-recurring expenses.
   * A non-recurring expense with date = last month must be excluded.
   * This verifies the previous behaviour is preserved for non-recurring rows.
   */
  test('non-recurring expense from last month is excluded from total_expenses', async ({
    page,
  }) => {
    const { token } = await seedUser('nonrecurring-prior');

    // Seed a non-recurring expense dated last month (£200.00).
    await createExpense(token, {
      amount: 200.0,
      date: lastMonthDate(),
      is_recurring: false,
      category: 'Shopping',
      description: 'Last month one-off purchase (non-recurring)',
    });

    // API-level assertion: prior-month non-recurring expense is excluded.
    const stats = await getDashboardStats(token);
    expect(stats.total_expenses).toBeCloseTo(0.0, 2);

    // net_position = 0 (income) − 0 (expenses) = 0.
    expect(stats.net_position).toBeCloseTo(0.0, 2);

    // UI assertion: the Net Position card shows zero (or near-zero).
    await loginViaStorage(page, token);

    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await dashboard.waitForStats();

    const netText = await dashboard.getNetPositionText();
    // No negative sign — net position should be £0 (or £0.00 etc).
    expect(netText).not.toMatch(/-|−/);
    // Should contain a 0 somewhere (£0, £0.00, etc.).
    expect(netText).toMatch(/0/);
  });

  /**
   * Scenario 3: Non-recurring expense from the current month IS counted.
   *
   * Current-month non-recurring expenses must still be included, just as they
   * were before Task 12.  This ensures the change is additive and does not
   * accidentally drop current-month rows.
   */
  test('non-recurring expense from the current month is included in total_expenses', async ({
    page,
  }) => {
    const { token } = await seedUser('nonrecurring-current');

    // Seed a non-recurring expense dated today (£75.50).
    await createExpense(token, {
      amount: 75.5,
      date: todayDate(),
      is_recurring: false,
      category: 'Groceries',
      description: 'Current month grocery run (non-recurring)',
    });

    // API-level assertion: current-month non-recurring is included.
    const stats = await getDashboardStats(token);
    expect(stats.total_expenses).toBeCloseTo(75.5, 2);

    // net_position = 0 − 75.50 = −75.50.
    expect(stats.net_position).toBeCloseTo(-75.5, 2);

    // UI assertion: the Net Position card shows the negative amount.
    await loginViaStorage(page, token);

    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await dashboard.waitForStats();

    const netText = await dashboard.getNetPositionText();
    // The currency pipe with '1.0-0' rounds to zero decimal places, so 75.50
    // renders as 76 or 75 depending on rounding.  We check the 7 prefix.
    expect(netText).toMatch(/7[5-6]/);
    expect(netText).toMatch(/-|−/);
  });

  /**
   * Bonus: Both recurring (prior month) and current-month non-recurring
   * expenses are summed together in total_expenses.
   *
   * This verifies the OR condition in the SQL WHERE clause works as a union
   * rather than replacing one set with the other.
   */
  test('recurring prior-month and current-month non-recurring expenses both contribute to total_expenses', async () => {
    const { token } = await seedUser('combined');

    // Recurring expense from last month: £50.00
    await createExpense(token, {
      amount: 50.0,
      date: lastMonthDate(),
      is_recurring: true,
      category: 'Subscriptions',
      description: 'Streaming subscription (recurring, prior month)',
    });

    // Non-recurring expense from today: £30.00
    await createExpense(token, {
      amount: 30.0,
      date: todayDate(),
      is_recurring: false,
      category: 'Transport',
      description: 'Train ticket (non-recurring, current month)',
    });

    // Non-recurring expense from last month: £999.00 — must be EXCLUDED.
    await createExpense(token, {
      amount: 999.0,
      date: lastMonthDate(),
      is_recurring: false,
      category: 'Electronics',
      description: 'Last month laptop purchase (non-recurring, prior month — excluded)',
    });

    // Expected: 50 (recurring) + 30 (current-month non-recurring) = 80.
    // The £999 prior-month non-recurring must NOT be counted.
    const stats = await getDashboardStats(token);
    expect(stats.total_expenses).toBeCloseTo(80.0, 2);
    expect(stats.net_position).toBeCloseTo(-80.0, 2);
  });
});
