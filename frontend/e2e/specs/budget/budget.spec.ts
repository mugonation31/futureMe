import { test, expect, Page } from '@playwright/test';
import { BudgetPage } from '../../pages/budget.page';
import { seedAuthToken, buildFakeJwt } from '../../utils/auth';

/**
 * Budget screen E2E tests — Task 28 (income + three-bucket CRUD)
 * ================================================================
 *
 * All tests mock the FastAPI backend via Playwright's page.route().
 * No live backend is required.
 *
 * The Angular authGuard checks for a JWT in localStorage ("fm_access_token");
 * we inject a structurally-valid unsigned token via seedAuthToken().  The
 * householdGuard calls GET /api/households/me, which we stub.  Every budget
 * endpoint is served by a small STATEFUL mock (BudgetApiMock below): mutations
 * update an in-memory BudgetResponse, so the component's refetch-after-mutation
 * GET naturally returns the new state — exactly like the real backend.
 *
 * Test groups
 * -----------
 * 1. Rendering    — income rows + live total, bucket order/headings, currency symbol
 * 2. Income add   — POST body {label, amount}, refetch GET fires, new row renders
 * 3. Line-item add — POST body carries the right `bucket` key, refetch renders it
 * 4. Edit + delete — PATCH income / DELETE line-item hit the right URLs, UI updates
 * 5. Goals        — save disabled until total = 100, PATCH body has all three pcts,
 *                   response consumed directly (no refetch)
 * 6. Currency     — PATCH body {currency}, money re-renders with the new symbol
 * 7. Failure      — 500 on a mutation shows the calm role=alert banner, typed
 *                   values preserved
 * 8. Auth guard   — visiting /budget without a JWT redirects to /login
 *
 * Run only this project with:
 *   npx playwright test --project=budget
 */

// ─── shared constants ────────────────────────────────────────────────────────

// The Angular app reads environment.apiUrl = 'http://localhost:8002/api'.
// E2E_API_URL must match that exactly for page.route() intercepts to fire.
const apiUrl = process.env['E2E_API_URL'] ?? 'http://localhost:8002/api';

const BUDGET_ID = 'budget-e2e-1';

const MOCK_HOUSEHOLD = {
  id: 'hh-e2e',
  name: 'E2E Household',
  invite_code: 'TEST-CODE',
};

// ─── fixture factory ─────────────────────────────────────────────────────────

type BucketKey = 'fundamentals' | 'future_you' | 'fun';

interface IncomeStream {
  id: string;
  budget_id: string;
  label: string;
  amount: number;
  position: number;
  created_at: string;
  updated_at: string;
}

interface LineItem extends Omit<IncomeStream, 'budget_id'> {
  budget_id: string;
  bucket: BucketKey;
}

const NOW = '2026-07-01T00:00:00Z';

function makeIncome(id: string, label: string, amount: number, position: number): IncomeStream {
  return { id, budget_id: BUDGET_ID, label, amount, position, created_at: NOW, updated_at: NOW };
}

function makeItem(id: string, bucket: BucketKey, label: string, amount: number, position: number): LineItem {
  return { id, budget_id: BUDGET_ID, bucket, label, amount, position, created_at: NOW, updated_at: NOW };
}

/**
 * A realistic snake_case BudgetResponse matching backend/models.py.
 * Income: Salary £2,500 + Freelance £500 = £3,000.
 * Buckets: fundamentals (Rent, Groceries), future_you (Index fund), fun (Dining out).
 */
function makeBudgetFixture() {
  return {
    id: BUDGET_ID,
    scope: 'household',
    user_id: null,
    household_id: 'hh-e2e',
    month: '2026-07-01',
    currency: 'GBP',
    goals: {
      fundamentals_goal_pct: 50,
      future_you_goal_pct: 20,
      fun_goal_pct: 30,
    },
    total_income: 3000,
    income_streams: [
      makeIncome('inc-1', 'Salary', 2500, 0),
      makeIncome('inc-2', 'Freelance', 500, 1),
    ],
    buckets: {
      fundamentals: {
        line_items: [
          makeItem('li-fund-1', 'fundamentals', 'Rent', 1200, 0),
          makeItem('li-fund-2', 'fundamentals', 'Groceries', 300, 1),
        ],
        dashboard: {
          bucket: 'fundamentals', goal_pct: 50, ideal_amount: 1500,
          actual_pct: 50, bucket_total: 1500, available_to_spend: 0, is_over_flag: false,
        },
      },
      future_you: {
        line_items: [
          makeItem('li-fy-1', 'future_you', 'Index fund', 400, 0),
        ],
        dashboard: {
          bucket: 'future_you', goal_pct: 20, ideal_amount: 600,
          actual_pct: 13.33, bucket_total: 400, available_to_spend: 200, is_over_flag: false,
        },
      },
      fun: {
        line_items: [
          makeItem('li-fun-1', 'fun', 'Dining out', 150, 0),
        ],
        dashboard: {
          bucket: 'fun', goal_pct: 30, ideal_amount: 900,
          actual_pct: 5, bucket_total: 150, available_to_spend: 750, is_over_flag: false,
        },
      },
    },
    allocation_status: { state: 'left', amount: 950 },
  };
}

type BudgetFixture = ReturnType<typeof makeBudgetFixture>;

// ─── stateful API mock ───────────────────────────────────────────────────────

interface RecordedRequest {
  method: string;
  url: string;
  body: Record<string, unknown> | null;
}

/**
 * Serves every /api/budget* endpoint from an in-memory BudgetResponse.
 * Mutations update the state, so the component's post-mutation refetch GET
 * returns the new rows — mirroring the real backend contract:
 *   - income / line-item mutations return only the entity (refetch expected)
 *   - PATCH /api/budget/{id} (goals or currency) returns the FULL budget
 */
class BudgetApiMock {
  budget: BudgetFixture = makeBudgetFixture();
  getCount = 0;
  readonly requests: RecordedRequest[] = [];
  /** When set, the next request matching method+substring gets a 500. */
  failNext: { method: string; urlIncludes: string } | null = null;
  private idSeq = 100;

  requestsMatching(method: string, urlIncludes: string): RecordedRequest[] {
    return this.requests.filter(r => r.method === method && r.url.includes(urlIncludes));
  }

  private recomputeIncomeTotal(): void {
    this.budget.total_income = this.budget.income_streams.reduce((s, i) => s + i.amount, 0);
  }

  async install(page: Page): Promise<void> {
    await page.route(url => url.href.startsWith(`${apiUrl}/budget`), async route => {
      const request = route.request();
      const method = request.method();
      const href = request.url();
      const path = new URL(href).pathname; // e.g. /api/budget/budget-e2e-1/income

      let body: Record<string, unknown> | null = null;
      const raw = request.postData();
      if (raw) body = JSON.parse(raw);
      this.requests.push({ method, url: href, body });

      if (this.failNext && method === this.failNext.method && href.includes(this.failNext.urlIncludes)) {
        this.failNext = null;
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Internal Server Error' }),
        });
        return;
      }

      const json = (status: number, payload: unknown) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });

      // GET /api/budget?scope=household — the screen's (re)fetch channel.
      if (method === 'GET' && path.endsWith('/budget')) {
        this.getCount++;
        await json(200, this.budget);
        return;
      }

      // PATCH /api/budget/{id} — goals or currency; returns the FULL budget.
      if (method === 'PATCH' && path.endsWith(`/budget/${BUDGET_ID}`)) {
        if (body && typeof body['currency'] === 'string') {
          this.budget.currency = body['currency'] as string;
        }
        if (body && typeof body['fundamentals_goal_pct'] === 'number') {
          this.budget.goals = {
            fundamentals_goal_pct: body['fundamentals_goal_pct'] as number,
            future_you_goal_pct: body['future_you_goal_pct'] as number,
            fun_goal_pct: body['fun_goal_pct'] as number,
          };
        }
        await json(200, this.budget);
        return;
      }

      // POST /api/budget/{id}/income — create income stream, return the entity.
      if (method === 'POST' && path.endsWith('/income')) {
        const stream = makeIncome(
          `inc-${this.idSeq++}`,
          String(body?.['label'] ?? ''),
          Number(body?.['amount'] ?? 0),
          this.budget.income_streams.length,
        );
        this.budget.income_streams.push(stream);
        this.recomputeIncomeTotal();
        await json(201, stream);
        return;
      }

      // PATCH/DELETE /api/budget/{id}/income/{incomeId}
      const incomeMatch = path.match(/\/income\/([^/]+)$/);
      if (incomeMatch) {
        const stream = this.budget.income_streams.find(s => s.id === incomeMatch[1]);
        if (!stream) { await json(404, { detail: 'Not found' }); return; }
        if (method === 'PATCH') {
          if (body && 'label' in body) stream.label = String(body['label']);
          if (body && 'amount' in body) stream.amount = Number(body['amount']);
          this.recomputeIncomeTotal();
          await json(200, stream);
          return;
        }
        if (method === 'DELETE') {
          this.budget.income_streams = this.budget.income_streams.filter(s => s.id !== stream.id);
          this.recomputeIncomeTotal();
          await route.fulfill({ status: 204, body: '' });
          return;
        }
      }

      // POST /api/budget/{id}/line-items — create in the bucket named in the body.
      if (method === 'POST' && path.endsWith('/line-items')) {
        const bucket = body?.['bucket'] as BucketKey;
        const view = this.budget.buckets[bucket];
        if (!view) { await json(422, { detail: 'Unknown bucket' }); return; }
        const item = makeItem(
          `li-${this.idSeq++}`,
          bucket,
          String(body?.['label'] ?? ''),
          Number(body?.['amount'] ?? 0),
          view.line_items.length,
        );
        view.line_items.push(item);
        await json(201, item);
        return;
      }

      // PATCH/DELETE /api/budget/{id}/line-items/{itemId}
      const itemMatch = path.match(/\/line-items\/([^/]+)$/);
      if (itemMatch) {
        const buckets = Object.values(this.budget.buckets);
        const view = buckets.find(v => v.line_items.some(i => i.id === itemMatch[1]));
        const item = view?.line_items.find(i => i.id === itemMatch[1]);
        if (!view || !item) { await json(404, { detail: 'Not found' }); return; }
        if (method === 'PATCH') {
          if (body && 'label' in body) item.label = String(body['label']);
          if (body && 'amount' in body) item.amount = Number(body['amount']);
          await json(200, item);
          return;
        }
        if (method === 'DELETE') {
          view.line_items = view.line_items.filter(i => i.id !== item.id);
          await route.fulfill({ status: 204, body: '' });
          return;
        }
      }

      await json(404, { detail: `Unmocked budget request: ${method} ${path}` });
    });
  }
}

// ─── shared setup ────────────────────────────────────────────────────────────

/** Inject a fake JWT + stub households/me so /budget passes both guards. */
async function stubAuth(page: Page): Promise<void> {
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

/** Full authenticated setup: guards satisfied + stateful budget API installed. */
async function openBudget(page: Page): Promise<{ budgetPage: BudgetPage; api: BudgetApiMock }> {
  await stubAuth(page);
  const api = new BudgetApiMock();
  await api.install(page);

  const budgetPage = new BudgetPage(page);
  await budgetPage.goto();
  await expect(budgetPage.incomeSection).toBeVisible();
  return { budgetPage, api };
}

// ─── 1. Rendering ─────────────────────────────────────────────────────────────

test.describe('Budget screen — rendering', () => {
  test('income streams render from the fixture with a live total', async ({ page }) => {
    const { budgetPage } = await openBudget(page);

    await expect(budgetPage.heading).toBeVisible();
    await expect(budgetPage.incomeRows).toHaveCount(2);
    await expect(budgetPage.incomeRowByLabel('Salary')).toContainText('£2,500.00');
    await expect(budgetPage.incomeRowByLabel('Freelance')).toContainText('£500.00');
    await expect(budgetPage.incomeTotal).toHaveText('£3,000.00');
  });

  test('three buckets render in order Fundamentals → Future You → Fun with correct copy', async ({ page }) => {
    const { budgetPage } = await openBudget(page);

    await expect(budgetPage.bucketSections).toHaveCount(3);
    await expect(budgetPage.bucketSections.nth(0)).toHaveAttribute('data-bucket', 'fundamentals');
    await expect(budgetPage.bucketSections.nth(1)).toHaveAttribute('data-bucket', 'future_you');
    await expect(budgetPage.bucketSections.nth(2)).toHaveAttribute('data-bucket', 'fun');

    await expect(budgetPage.bucketHeading('fundamentals')).toHaveText('Fundamentals');
    await expect(budgetPage.bucketSubtitle('fundamentals')).toHaveText('your needs');
    await expect(budgetPage.bucketHeading('future_you')).toHaveText('Future You');
    await expect(budgetPage.bucketSubtitle('future_you')).toHaveText('savings & investments');
    await expect(budgetPage.bucketHeading('fun')).toHaveText('Fun');
    await expect(budgetPage.bucketSubtitle('fun')).toHaveText('your wants');
  });

  test('line items and money render with the budget currency symbol (GBP → £)', async ({ page }) => {
    const { budgetPage } = await openBudget(page);

    await expect(budgetPage.bucketRows('fundamentals')).toHaveCount(2);
    await expect(budgetPage.bucketRowByLabel('fundamentals', 'Rent')).toContainText('£1,200.00');
    await expect(budgetPage.bucketRowByLabel('future_you', 'Index fund')).toContainText('£400.00');
    await expect(budgetPage.bucketRowByLabel('fun', 'Dining out')).toContainText('£150.00');
    await expect(budgetPage.currencySelect).toHaveValue('GBP');
  });
});

// ─── 2. Income add ────────────────────────────────────────────────────────────

test.describe('Budget screen — income add', () => {
  test('adding an income stream POSTs {label, amount}, refetches, and renders the new row', async ({ page }) => {
    const { budgetPage, api } = await openBudget(page);
    expect(api.getCount).toBe(1); // initial load only

    await budgetPage.incomeAddLabel.fill('Side hustle');
    await budgetPage.incomeAddAmount.fill('150');
    await budgetPage.incomeAddButton.click();

    // New row appears after the refetch GET returns the updated state.
    await expect(budgetPage.incomeRows).toHaveCount(3);
    await expect(budgetPage.incomeRowByLabel('Side hustle')).toContainText('£150.00');
    await expect(budgetPage.incomeTotal).toHaveText('£3,150.00');

    // Exactly one POST with the exact create body.
    const posts = api.requestsMatching('POST', `/budget/${BUDGET_ID}/income`);
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({ label: 'Side hustle', amount: 150 });

    // The refetch GET fired (initial load + post-mutation refetch).
    expect(api.getCount).toBe(2);

    // Confirmed success clears the add form.
    await expect(budgetPage.incomeAddLabel).toHaveValue('');
    await expect(budgetPage.incomeAddAmount).toHaveValue('');
  });
});

// ─── 3. Line-item add ─────────────────────────────────────────────────────────

test.describe('Budget screen — line-item add', () => {
  test('adding a line item in Future You POSTs the right bucket key and renders after refetch', async ({ page }) => {
    const { budgetPage, api } = await openBudget(page);

    await budgetPage.bucketAddLabel('future_you').fill('ISA top-up');
    await budgetPage.bucketAddAmount('future_you').fill('200');
    await budgetPage.bucketAddButton('future_you').click();

    await expect(budgetPage.bucketRows('future_you')).toHaveCount(2);
    await expect(budgetPage.bucketRowByLabel('future_you', 'ISA top-up')).toContainText('£200.00');

    const posts = api.requestsMatching('POST', `/budget/${BUDGET_ID}/line-items`);
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({ bucket: 'future_you', label: 'ISA top-up', amount: 200 });

    // The new row landed in Future You only — the other buckets are untouched.
    await expect(budgetPage.bucketRows('fundamentals')).toHaveCount(2);
    await expect(budgetPage.bucketRows('fun')).toHaveCount(1);
    expect(api.getCount).toBe(2);
  });
});

// ─── 4. Edit + delete ─────────────────────────────────────────────────────────

test.describe('Budget screen — edit and delete', () => {
  test('editing an income stream PATCHes the right URL and the row updates after refetch', async ({ page }) => {
    const { budgetPage, api } = await openBudget(page);

    // Target the row by index, not by label text: once the row enters edit
    // mode its label moves into an <input value="…">, and input values are not
    // text content, so a hasText filter would resolve to zero rows. Salary is
    // the first income stream (position 0).
    const salaryRow = budgetPage.incomeRows.nth(0);
    await budgetPage.incomeEditButton(salaryRow).click();

    // Edit inputs are pre-filled with the current values.
    await expect(budgetPage.incomeEditLabelInput(salaryRow)).toHaveValue('Salary');
    await expect(budgetPage.incomeEditAmountInput(salaryRow)).toHaveValue('2500');

    await budgetPage.incomeEditAmountInput(salaryRow).fill('2600');
    await budgetPage.incomeSaveButton(salaryRow).click();

    await expect(budgetPage.incomeRowByLabel('Salary')).toContainText('£2,600.00');
    await expect(budgetPage.incomeTotal).toHaveText('£3,100.00');

    const patches = api.requestsMatching('PATCH', `/budget/${BUDGET_ID}/income/inc-1`);
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toEqual({ label: 'Salary', amount: 2600 });
    expect(api.getCount).toBe(2);
  });

  test('deleting a line item DELETEs the right URL and the row disappears after refetch', async ({ page }) => {
    const { budgetPage, api } = await openBudget(page);

    const diningRow = budgetPage.bucketRowByLabel('fun', 'Dining out');
    await expect(diningRow).toBeVisible();
    await budgetPage.itemDeleteButton(diningRow).click();

    await expect(budgetPage.bucketRows('fun')).toHaveCount(0);
    await expect(budgetPage.bucketRowByLabel('fun', 'Dining out')).toHaveCount(0);

    const deletes = api.requestsMatching('DELETE', `/budget/${BUDGET_ID}/line-items/li-fun-1`);
    expect(deletes).toHaveLength(1);
    expect(api.getCount).toBe(2);
  });
});

// ─── 5. Goal percentages — save at exactly 100 ───────────────────────────────

test.describe('Budget screen — goal percentages', () => {
  test('save is disabled with a hint while goals total ≠ 100, then enabled and PATCHed at 100', async ({ page }) => {
    const { budgetPage, api } = await openBudget(page);

    // Seeded 50/20/30 = 100: save enabled, no hint.
    await expect(budgetPage.goalsTotal).toHaveText('Total: 100%');
    await expect(budgetPage.goalsSaveButton).toBeEnabled();
    await expect(budgetPage.goalsHint).toHaveCount(0);

    // Nudge fundamentals 50 → 40: total 90, save disabled, hint visible.
    await budgetPage.goalInput('fundamentals').fill('40');
    await expect(budgetPage.goalsTotal).toHaveText('Total: 90%');
    await expect(budgetPage.goalsSaveButton).toBeDisabled();
    await expect(budgetPage.goalsHint).toBeVisible();
    await expect(budgetPage.goalsHint).toContainText('90%');

    // Balance future_you 20 → 30: total back to exactly 100.
    await budgetPage.goalInput('future_you').fill('30');
    await expect(budgetPage.goalsTotal).toHaveText('Total: 100%');
    await expect(budgetPage.goalsSaveButton).toBeEnabled();
    await expect(budgetPage.goalsHint).toHaveCount(0);

    await budgetPage.goalsSaveButton.click();

    // PATCH /api/budget/{id} carries ALL THREE pcts (all-or-none contract).
    const patches = api.requestsMatching('PATCH', `/budget/${BUDGET_ID}`);
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toEqual({
      fundamentals_goal_pct: 40,
      future_you_goal_pct: 30,
      fun_goal_pct: 30,
    });

    // The response IS the full budget — consumed directly, no refetch GET.
    await expect(budgetPage.goalsSaveButton).toBeEnabled();
    await expect(budgetPage.goalInput('fundamentals')).toHaveValue('40');
    expect(api.getCount).toBe(1);
  });
});

// ─── 6. Currency change ───────────────────────────────────────────────────────

test.describe('Budget screen — currency', () => {
  test('changing currency PATCHes {currency} and money re-renders with the new symbol', async ({ page }) => {
    const { budgetPage, api } = await openBudget(page);
    await expect(budgetPage.incomeTotal).toHaveText('£3,000.00');

    await budgetPage.currencySelect.selectOption('USD');

    // Money everywhere re-renders from the mocked full-budget response.
    await expect(budgetPage.incomeTotal).toHaveText('$3,000.00');
    await expect(budgetPage.incomeRowByLabel('Salary')).toContainText('$2,500.00');
    await expect(budgetPage.bucketRowByLabel('fundamentals', 'Rent')).toContainText('$1,200.00');
    await expect(budgetPage.currencySelect).toHaveValue('USD');

    const patches = api.requestsMatching('PATCH', `/budget/${BUDGET_ID}`);
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toEqual({ currency: 'USD' });

    // updateCurrency returns the full budget — no refetch needed.
    expect(api.getCount).toBe(1);
  });
});

// ─── 7. Failed mutation — calm error banner ──────────────────────────────────

test.describe('Budget screen — failed mutation', () => {
  test('a 500 on line-item add shows the role=alert banner and preserves typed values', async ({ page }) => {
    const { budgetPage, api } = await openBudget(page);
    api.failNext = { method: 'POST', urlIncludes: '/line-items' };

    await budgetPage.bucketAddLabel('fun').fill('Gym membership');
    await budgetPage.bucketAddAmount('fun').fill('45');
    await budgetPage.bucketAddButton('fun').click();

    // Calm banner, announced to assistive tech via role=alert.
    await expect(budgetPage.mutationErrorBanner).toBeVisible();
    await expect(budgetPage.mutationErrorBanner).toHaveAttribute('role', 'alert');
    await expect(budgetPage.mutationErrorBanner).toContainText("Couldn't add that line item just now");

    // Typed values survive the failure — nothing was cleared.
    await expect(budgetPage.bucketAddLabel('fun')).toHaveValue('Gym membership');
    await expect(budgetPage.bucketAddAmount('fun')).toHaveValue('45');

    // No row was added and no refetch fired.
    await expect(budgetPage.bucketRows('fun')).toHaveCount(1);
    expect(api.getCount).toBe(1);

    // Retrying after the transient failure succeeds and clears the banner.
    await budgetPage.bucketAddButton('fun').click();
    await expect(budgetPage.bucketRowByLabel('fun', 'Gym membership')).toContainText('£45.00');
    await expect(budgetPage.mutationErrorBanner).toHaveCount(0);
  });
});

// ─── 8. Auth guard ────────────────────────────────────────────────────────────

test.describe('Budget screen — auth guard', () => {
  test('visiting /budget without a JWT redirects to /login', async ({ page }) => {
    // No token seeded, no mocks: the authGuard must bounce to /login. The
    // guard appends a ?returnUrl= query param, so allow a trailing query string.
    await page.goto('/budget');
    await page.waitForURL('**/login**');
    await expect(page).toHaveURL(/\/login(\?|$)/);
  });
});
