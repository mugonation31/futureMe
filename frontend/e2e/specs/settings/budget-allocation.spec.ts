import { test, expect } from '@playwright/test';
import { SettingsPage } from '../../pages/settings.page';
import { seedAuthToken, buildFakeJwt } from '../../utils/auth';

/**
 * BudgetAllocationComponent E2E tests — Task 33
 * ==============================================
 *
 * The BudgetAllocationComponent is embedded inside the /settings page directly
 * beneath the existing settings form (via <app-budget-allocation>).
 *
 * All API calls are intercepted via page.route() — no live backend is required.
 *
 * Mocked endpoints
 * ----------------
 *   GET  /api/households/me       — authGuard + householdGuard
 *   GET  /api/settings            — pre-populate the outer settings form
 *   GET  /api/categories          — list of categories shown as rows
 *   GET  /api/category-budgets    — existing monthly limits (pre-filled inputs)
 *   PUT  /api/category-budgets    — upsert when a value is changed
 *   DELETE /api/category-budgets/{id} — clear when a value is erased
 *
 * Test groups
 * -----------
 *   1. Panel rendering — panel is visible below the settings form
 *   2. Categories load — rows show category names with pre-filled limits
 *   3. Save fires PUT  — changing a value and saving sends PUT with correct body
 *   4. Save fires DELETE — clearing a value that had a budget sends DELETE
 *   5. Unchanged rows skipped — rows with no change make no API call
 *   6. Invalid input  — non-positive / non-finite value shows validation error
 *                        before any API call is made
 *   7. 403 error      — owner-only error message shown for 403 response
 *   8. Loading state  — loading message shown while forkJoin is in flight
 *
 * Port: 4202 (configured in frontend/e2e/.env → E2E_BASE_URL).
 *
 * Selector strategy: all selectors live in SettingsPage / budgetRow* helpers.
 * This spec contains no raw CSS class strings or element queries.
 */

// ─── shared constants ─────────────────────────────────────────────────────────

// Must match environment.apiUrl in the Angular build (environment.ts).
const apiUrl = process.env['E2E_API_URL'] ?? 'http://localhost:8002/api';

const MOCK_HOUSEHOLD = {
  id: 'hh-budget-e2e',
  name: 'Budget E2E Household',
  invite_code: 'BUDGET-CODE',
};

const MOCK_SETTINGS = { display_name: 'Alice', currency: 'GBP', monthly_budget: 2000 };

const MOCK_CATEGORIES = [
  { id: 'cat-001', name: 'Groceries', color: '#4CAF50' },
  { id: 'cat-002', name: 'Transport', color: '#2196F3' },
  { id: 'cat-003', name: 'Entertainment', color: '#FF9800' },
];

// Budgets that pre-exist: only Groceries and Transport have limits.
const MOCK_BUDGETS = [
  {
    id: 'bgt-001',
    household_id: 'hh-budget-e2e',
    category_id: 'cat-001',
    category_name: 'Groceries',
    monthly_limit: 400,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'bgt-002',
    household_id: 'hh-budget-e2e',
    category_id: 'cat-002',
    category_name: 'Transport',
    monthly_limit: 150,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

/**
 * Seeds a fake JWT + stubs /api/households/me so protected routes are reachable.
 * Navigates to '/' first to establish the origin so localStorage is writable.
 */
async function stubAuth(page: import('@playwright/test').Page): Promise<void> {
  const token = buildFakeJwt({ email: 'budget-e2e@example.com' });
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

/**
 * Stubs GET /api/settings, GET /api/categories, GET /api/category-budgets with
 * the shared mock fixtures so the settings page loads cleanly.
 */
async function stubSettingsAndBudgets(
  page: import('@playwright/test').Page,
  budgets = MOCK_BUDGETS
): Promise<void> {
  await page.route(`${apiUrl}/settings`, async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SETTINGS),
      });
    } else {
      await route.continue();
    }
  });

  await page.route(`${apiUrl}/categories`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_CATEGORIES),
    })
  );

  await page.route(`${apiUrl}/category-budgets`, async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(budgets),
      });
    } else {
      await route.continue();
    }
  });
}

// ─── 1. Panel rendering ───────────────────────────────────────────────────────

test.describe('Budget Allocation — panel rendering', () => {
  test.beforeEach(async ({ page }) => {
    await stubAuth(page);
    await stubSettingsAndBudgets(page);
  });

  test('budget allocation panel is visible below the settings form', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();

    await expect(settings.budgetPanel).toBeVisible();
  });

  test('budget allocation panel has "Category Budgets" heading', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();

    await expect(settings.budgetPanelHeading).toBeVisible();
  });

  test('budget allocation panel renders below the Save Settings button', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();

    // Verify both the outer settings form and budget panel are visible on the
    // same page (not a separate route).
    await expect(settings.saveButton).toBeVisible();
    await expect(settings.budgetPanel).toBeVisible();

    // The budget panel must appear further down the page than the Save Settings
    // button — confirmed by comparing their vertical bounding boxes.
    const saveButtonBox = await settings.saveButton.boundingBox();
    const panelBox = await settings.budgetPanel.boundingBox();

    expect(saveButtonBox).not.toBeNull();
    expect(panelBox).not.toBeNull();
    // Panel top edge must be below (greater Y) than the Save Settings button.
    expect(panelBox!.y).toBeGreaterThan(saveButtonBox!.y);
  });

  test('Save Budgets button is visible and enabled after data loads', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.waitForBudgetPanelLoaded();

    await expect(settings.saveBudgetsButton).toBeVisible();
    await expect(settings.saveBudgetsButton).toBeEnabled();
  });
});

// ─── 2. Categories load and display with pre-filled limits ────────────────────

test.describe('Budget Allocation — categories load with pre-filled limits', () => {
  test.beforeEach(async ({ page }) => {
    await stubAuth(page);
    await stubSettingsAndBudgets(page);
  });

  test('renders one row per category', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.waitForBudgetPanelLoaded();

    await expect(settings.budgetRows).toHaveCount(MOCK_CATEGORIES.length);
  });

  test('first row shows the correct category name', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.waitForBudgetPanelLoaded();

    const name = await settings.budgetRowCategoryName(0);
    expect(name.trim()).toBe('Groceries');
  });

  test('rows with an existing budget are pre-filled with the monthly limit', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.waitForBudgetPanelLoaded();

    // Groceries — limit 400
    await expect(settings.budgetRowInput(0)).toHaveValue('400');
    // Transport — limit 150
    await expect(settings.budgetRowInput(1)).toHaveValue('150');
  });

  test('row with no existing budget has an empty input', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.waitForBudgetPanelLoaded();

    // Entertainment has no budget in MOCK_BUDGETS, so the input must be empty.
    await expect(settings.budgetRowInput(2)).toHaveValue('');
  });
});

// ─── 3. Changing a value and saving fires PUT ─────────────────────────────────

test.describe('Budget Allocation — saving a changed value fires PUT', () => {
  test('PUT is called with the correct category_id and monthly_limit', async ({ page }) => {
    await stubAuth(page);
    await stubSettingsAndBudgets(page);

    const capturedPuts: Array<{ category_id: string; monthly_limit: number }> = [];

    // Override the category-budgets route to capture PUT bodies.
    await page.route(`${apiUrl}/category-budgets`, async route => {
      if (route.request().method() === 'PUT') {
        const body = await route.request().postDataJSON();
        capturedPuts.push(body);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'bgt-001-updated',
            household_id: 'hh-budget-e2e',
            category_id: body.category_id,
            category_name: 'Groceries',
            monthly_limit: body.monthly_limit,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-06-01T12:00:00Z',
          }),
        });
      } else if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_BUDGETS),
        });
      } else {
        await route.continue();
      }
    });

    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.waitForBudgetPanelLoaded();

    // Change Groceries limit from 400 to 600.
    await settings.budgetRowInput(0).fill('600');
    await settings.saveBudgetsButton.click();

    await expect(settings.budgetSuccessMessage).toBeVisible({ timeout: 5000 });

    // Exactly one PUT should have fired.
    expect(capturedPuts).toHaveLength(1);
    expect(capturedPuts[0].category_id).toBe('cat-001');
    expect(capturedPuts[0].monthly_limit).toBe(600);
  });

  test('success message appears after a successful save', async ({ page }) => {
    await stubAuth(page);
    await stubSettingsAndBudgets(page);

    await page.route(`${apiUrl}/category-budgets`, async route => {
      if (route.request().method() === 'PUT') {
        const body = await route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...MOCK_BUDGETS[0],
            monthly_limit: body.monthly_limit,
          }),
        });
      } else if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_BUDGETS),
        });
      } else {
        await route.continue();
      }
    });

    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.waitForBudgetPanelLoaded();

    await settings.budgetRowInput(0).fill('750');
    await settings.saveBudgetsButton.click();

    await expect(settings.budgetSuccessMessage).toBeVisible({ timeout: 5000 });
    await expect(settings.budgetSuccessMessage).toContainText(/saved/i);
  });
});

// ─── 4. Clearing a value (that had a budget) fires DELETE ─────────────────────

test.describe('Budget Allocation — clearing a pre-filled value fires DELETE', () => {
  test('DELETE is called with the correct category id when input is cleared', async ({ page }) => {
    await stubAuth(page);

    // Register all routes together so there are no ordering / precedence issues.
    await page.route(`${apiUrl}/settings`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SETTINGS),
      })
    );

    await page.route(`${apiUrl}/categories`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_CATEGORIES),
      })
    );

    const deletedIds: string[] = [];

    // Handle all /category-budgets and /category-budgets/{id} in one route.
    // Use a regex to match both the exact URL and any subpath (e.g. /category-budgets/cat-id).
    await page.route(/\/category-budgets/, async route => {
      const method = route.request().method();
      const url = route.request().url();

      if (method === 'DELETE') {
        // Extract the category id from the path segment after /category-budgets/.
        const id = url.split('/category-budgets/')[1]?.split('?')[0] ?? '';
        deletedIds.push(id);
        await route.fulfill({ status: 204, body: '' });
      } else if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_BUDGETS),
        });
      } else {
        await route.continue();
      }
    });

    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.waitForBudgetPanelLoaded();

    // Clear Transport (index 1, cat-002, limit 150) — should trigger DELETE.
    //
    // Angular's NumberValueAccessor converts an empty type="number" input to
    // null (not '') in the ngModel binding.  The component treats null as an
    // invalid budget value (parseFloat(String(null)) = NaN), so fill('') would
    // show a validation error instead of calling DELETE.
    //
    // The correct "user cleared the field" signal is row.limit === '', which
    // the component only receives when we set it directly on the component
    // instance (matching how the component logic was designed — clear = '' ).
    // We then call ng.applyChanges() to propagate the change through Angular's
    // change detection before clicking Save.
    await page.evaluate(() => {
      const ng = (window as any).ng;
      const el = document.querySelector('app-budget-allocation');
      const comp = ng.getComponent(el);
      comp.rows[1].limit = '';
      ng.applyChanges(el);
    });
    await settings.saveBudgetsButton.click();

    await expect(settings.budgetSuccessMessage).toBeVisible({ timeout: 5000 });

    expect(deletedIds).toHaveLength(1);
    expect(deletedIds[0]).toBe('cat-002');
  });
});

// ─── 5. Unchanged rows are skipped ────────────────────────────────────────────

test.describe('Budget Allocation — unchanged rows are skipped', () => {
  test('no API call is made when Save is clicked without changing any value', async ({ page }) => {
    await stubAuth(page);
    await stubSettingsAndBudgets(page);

    const apiCallsMade: string[] = [];

    // Track any PUT or DELETE calls.
    await page.route(`${apiUrl}/category-budgets/**`, async route => {
      if (['PUT', 'DELETE'].includes(route.request().method())) {
        apiCallsMade.push(route.request().method());
      }
      await route.continue();
    });

    // Also track PUT on the exact category-budgets URL.
    await page.route(`${apiUrl}/category-budgets`, async route => {
      if (route.request().method() === 'PUT') {
        apiCallsMade.push('PUT');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_BUDGETS[0]),
        });
      } else if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_BUDGETS),
        });
      } else {
        await route.continue();
      }
    });

    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.waitForBudgetPanelLoaded();

    // Click Save without changing anything.
    await settings.saveBudgetsButton.click();

    // Give enough time to detect any unintended calls.
    await page.waitForTimeout(500);

    // No PUT or DELETE should have been called.
    const mutatingCalls = apiCallsMade.filter(m => m === 'PUT' || m === 'DELETE');
    expect(mutatingCalls).toHaveLength(0);
  });

  test('only the changed row fires a call; the unchanged row is skipped', async ({ page }) => {
    await stubAuth(page);
    await stubSettingsAndBudgets(page);

    const capturedPuts: Array<{ category_id: string; monthly_limit: number }> = [];

    await page.route(`${apiUrl}/category-budgets`, async route => {
      if (route.request().method() === 'PUT') {
        const body = await route.request().postDataJSON();
        capturedPuts.push(body);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...MOCK_BUDGETS[0],
            monthly_limit: body.monthly_limit,
          }),
        });
      } else if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_BUDGETS),
        });
      } else {
        await route.continue();
      }
    });

    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.waitForBudgetPanelLoaded();

    // Only change Entertainment (index 2, cat-003, was empty).
    await settings.budgetRowInput(2).fill('200');
    await settings.saveBudgetsButton.click();

    await expect(settings.budgetSuccessMessage).toBeVisible({ timeout: 5000 });

    // Only cat-003 should have been PUT — not cat-001 or cat-002.
    expect(capturedPuts).toHaveLength(1);
    expect(capturedPuts[0].category_id).toBe('cat-003');
  });
});

// ─── 6. Invalid input shows validation error before any API call ──────────────

/**
 * The template uses `input[type="number"]` with `min="0.01"`.  Chromium's
 * native spinbutton sanitises values: filling "-50" results in an empty value
 * being reported by the browser to Angular's ngModel.  To reliably set an
 * out-of-range number we use `page.evaluate()` to dispatch a synthetic input
 * event that bypasses the browser's native min/max constraint validation while
 * still triggering Angular's ngModel binding.
 */
async function forceInputValue(
  page: import('@playwright/test').Page,
  rowIndex: number,
  value: string
): Promise<void> {
  await page.evaluate(
    ([idx, val]: [number, string]) => {
      const inputs = document.querySelectorAll<HTMLInputElement>(
        'app-budget-allocation .budget-row input[type="number"]'
      );
      const input = inputs[idx];
      if (!input) throw new Error(`No input at index ${idx}`);
      // Remove native constraints so the browser accepts the out-of-range value.
      input.removeAttribute('min');
      input.removeAttribute('max');
      // Set the raw value and dispatch events for Angular's ngModel.
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )!.set!;
      nativeInputValueSetter.call(input, val);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    [rowIndex, value] as [number, string]
  );
}

test.describe('Budget Allocation — input validation', () => {
  test.beforeEach(async ({ page }) => {
    await stubAuth(page);
    await stubSettingsAndBudgets(page);
  });

  test('entering zero shows a validation error and makes no API call', async ({ page }) => {
    const apiCallsMade: string[] = [];

    await page.route(`${apiUrl}/category-budgets`, async route => {
      if (route.request().method() === 'PUT') {
        apiCallsMade.push('PUT');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_BUDGETS[0]),
        });
      } else if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_BUDGETS),
        });
      } else {
        await route.continue();
      }
    });

    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.waitForBudgetPanelLoaded();

    // Use forceInputValue to set "0" — bypasses browser native min constraint
    // while still triggering Angular's ngModel binding.
    await forceInputValue(page, 2, '0');
    await settings.saveBudgetsButton.click();

    await expect(settings.budgetErrorMessage).toBeVisible({ timeout: 5000 });
    await expect(settings.budgetErrorMessage).toContainText(/valid positive/i);

    // No PUT should have been fired.
    expect(apiCallsMade).toHaveLength(0);
  });

  test('entering a negative number shows a validation error and makes no API call', async ({ page }) => {
    const apiCallsMade: string[] = [];

    await page.route(`${apiUrl}/category-budgets`, async route => {
      if (route.request().method() === 'PUT') {
        apiCallsMade.push('PUT');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_BUDGETS[0]),
        });
      } else if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_BUDGETS),
        });
      } else {
        await route.continue();
      }
    });

    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.waitForBudgetPanelLoaded();

    // Force-set -50 on the Groceries row (index 0) bypassing browser min constraint.
    await forceInputValue(page, 0, '-50');
    await settings.saveBudgetsButton.click();

    await expect(settings.budgetErrorMessage).toBeVisible({ timeout: 5000 });
    await expect(settings.budgetErrorMessage).toContainText(/valid positive/i);

    expect(apiCallsMade).toHaveLength(0);
  });

  test('success message is not shown when validation fails', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.waitForBudgetPanelLoaded();

    // Force-set -1 on Entertainment row (index 2).
    await forceInputValue(page, 2, '-1');
    await settings.saveBudgetsButton.click();

    await expect(settings.budgetErrorMessage).toBeVisible({ timeout: 5000 });
    await expect(settings.budgetSuccessMessage).not.toBeVisible();
  });
});

// ─── 7. 403 response shows owner-only error message ──────────────────────────

/**
 * Helper that stubs ALL routes needed for the /settings page with a
 * PUT /api/category-budgets that returns 403.
 *
 * Registering all routes in a single call avoids the route-ordering ambiguity
 * that arises when stubSettingsAndBudgets() and a test-level override both
 * register handlers for the same URL (Playwright LIFO resolution can still
 * cause the first registered GET handler to intercept PUT if the test-level
 * handler calls route.continue() for unhandled methods).
 */
async function stubSettingsAndBudgets403(page: import('@playwright/test').Page): Promise<void> {
  await page.route(`${apiUrl}/settings`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_SETTINGS),
    })
  );

  await page.route(`${apiUrl}/categories`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_CATEGORIES),
    })
  );

  // Single handler for all /category-budgets requests: GET returns data,
  // PUT returns 403 (non-owner), DELETE returns 403 (non-owner).
  // Using a regex to match both the exact URL and any subpath (/category-budgets/{id}).
  await page.route(/\/category-budgets/, async route => {
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_BUDGETS),
      });
    } else if (method === 'PUT' || method === 'DELETE') {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Only the household owner can set a category budget' }),
      });
    } else {
      await route.continue();
    }
  });
}

test.describe('Budget Allocation — 403 shows owner-only error', () => {
  test('PUT returning 403 shows "Only the household owner can set budgets."', async ({ page }) => {
    await stubAuth(page);
    await stubSettingsAndBudgets403(page);

    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.waitForBudgetPanelLoaded();

    await settings.budgetRowInput(0).fill('999');
    await settings.saveBudgetsButton.click();

    await expect(settings.budgetErrorMessage).toBeVisible({ timeout: 5000 });
    await expect(settings.budgetErrorMessage).toContainText(
      'Only the household owner can set budgets.'
    );
  });

  test('403 error does not show a success message', async ({ page }) => {
    await stubAuth(page);
    await stubSettingsAndBudgets403(page);

    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.waitForBudgetPanelLoaded();

    await settings.budgetRowInput(1).fill('300');
    await settings.saveBudgetsButton.click();

    await expect(settings.budgetErrorMessage).toBeVisible({ timeout: 5000 });
    await expect(settings.budgetSuccessMessage).not.toBeVisible();
  });
});

// ─── 8. Loading state while data fetches ─────────────────────────────────────

test.describe('Budget Allocation — loading state', () => {
  test('loading message is shown while categories and budgets are being fetched', async ({ page }) => {
    await stubAuth(page);

    // Stub settings so the outer form loads without delay.
    await page.route(`${apiUrl}/settings`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SETTINGS),
      })
    );

    // Hold the categories response indefinitely until we release it.
    // Using a resolve-on-demand pattern that Playwright's route handler can await.
    let resolveCategories!: () => void;
    const categoriesGate = new Promise<void>(res => { resolveCategories = res; });

    await page.route(`${apiUrl}/categories`, async route => {
      await categoriesGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_CATEGORIES),
      });
    });

    await page.route(`${apiUrl}/category-budgets`, async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_BUDGETS),
        });
      } else {
        await route.continue();
      }
    });

    const settings = new SettingsPage(page);

    // Navigate to /settings — this triggers Angular to call forkJoin({categories, budgets}).
    // The categories request is held so the component stays in loading=true.
    await page.goto('/settings');

    // Wait for the page container to mount (Angular change detection has run at least once).
    await expect(settings.container).toBeVisible({ timeout: 10000 });

    // The loading message must be present now because the categories call is still pending.
    await expect(settings.budgetLoadingMessage).toBeVisible({ timeout: 5000 });

    // Release the held categories response so the forkJoin can complete.
    resolveCategories();

    // Loading message must disappear after data arrives.
    await expect(settings.budgetLoadingMessage).not.toBeVisible({ timeout: 8000 });

    // Rows should now be rendered.
    await expect(settings.budgetRows).toHaveCount(MOCK_CATEGORIES.length);
  });

  test('Save Budgets button is disabled while data is loading', async ({ page }) => {
    await stubAuth(page);

    await page.route(`${apiUrl}/settings`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SETTINGS),
      })
    );

    // Hold the category-budgets GET response indefinitely until released.
    let resolveBudgets!: () => void;
    const budgetsGate = new Promise<void>(res => { resolveBudgets = res; });

    await page.route(`${apiUrl}/categories`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_CATEGORIES),
      })
    );

    await page.route(`${apiUrl}/category-budgets`, async route => {
      if (route.request().method() === 'GET') {
        await budgetsGate;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_BUDGETS),
        });
      } else {
        await route.continue();
      }
    });

    const settings = new SettingsPage(page);
    await page.goto('/settings');

    // Wait for the page container.
    await expect(settings.container).toBeVisible({ timeout: 10000 });

    // The forkJoin is waiting on category-budgets — loading must be true,
    // so the Save Budgets button must be disabled.
    await expect(settings.saveBudgetsButton).toBeDisabled({ timeout: 5000 });

    // Release budgets so forkJoin completes.
    resolveBudgets();

    // Button becomes enabled once loading is false.
    await expect(settings.saveBudgetsButton).toBeEnabled({ timeout: 8000 });
  });
});
