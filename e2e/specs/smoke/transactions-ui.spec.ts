/**
 * Transactions UI — E2E smoke tests
 *
 * Tests the /transactions Angular route using mocked backend calls so that no
 * real backend or database is required.  All API calls are intercepted with
 * page.route() before the page loads.
 *
 * Requires the Angular dev server running on http://localhost:4200:
 *   cd frontend && ng serve   (or ng serve --port 4200)
 *
 * Run just this project:
 *   npx playwright test --project=transactions-ui
 *
 * Scenarios covered:
 *   1.  Unauthenticated user visiting /transactions is redirected to /login
 *   2.  Authenticated user with household sees the transactions page with month selector
 *   3.  Authenticated user can toggle the "Add Transaction" form open and closed
 *   4.  Form validation — submitting with empty amount shows a validation error
 *   5.  Adding a transaction (POST intercepted, saved event collapses the form)
 *   6.  Deleting a transaction (DELETE intercepted, confirm dialog accepted)
 *   7.  Changing the month selector fires a new GET for that month
 */

import { test, expect, Page } from '@playwright/test';
import { TransactionsPage, buildFakeToken } from '../../pages/transactions.page';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const FAKE_TOKEN = buildFakeToken('user-abc', 'e2e@futureme-test.example.com');

const TODAY = new Date().toISOString().slice(0, 10);
const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

// A month in the past (one month back) for the month-selector test.
const pastDate = new Date();
pastDate.setMonth(pastDate.getMonth() - 1);
const PAST_MONTH = pastDate.toISOString().slice(0, 7);

const MOCK_HOUSEHOLD = {
  id: 'household-123',
  name: 'Test Household',
  created_at: '2026-01-01T00:00:00Z',
};

const MOCK_CATEGORIES = [
  { id: 'cat-1', household_id: 'household-123', name: 'Groceries', icon: null, color: null, is_default: true },
  { id: 'cat-2', household_id: 'household-123', name: 'Salary', icon: null, color: null, is_default: true },
];

const MOCK_TRANSACTIONS = [
  {
    id: 'txn-1',
    household_id: 'household-123',
    user_id: 'user-abc',
    category_id: 'cat-1',
    category_name: 'Groceries',
    amount: 42.50,
    type: 'expense',
    description: 'Weekly shop',
    date: TODAY,
    created_at: TODAY + 'T10:00:00Z',
    updated_at: TODAY + 'T10:00:00Z',
  },
  {
    id: 'txn-2',
    household_id: 'household-123',
    user_id: 'user-abc',
    category_id: null,
    category_name: null,
    amount: 1500.00,
    type: 'income',
    description: 'Salary',
    date: TODAY,
    created_at: TODAY + 'T09:00:00Z',
    updated_at: TODAY + 'T09:00:00Z',
  },
];

const NEW_TRANSACTION = {
  id: 'txn-new',
  household_id: 'household-123',
  user_id: 'user-abc',
  category_id: null,
  category_name: null,
  amount: 25.00,
  type: 'expense',
  description: 'Coffee',
  date: TODAY,
  created_at: TODAY + 'T11:00:00Z',
  updated_at: TODAY + 'T11:00:00Z',
};

// ---------------------------------------------------------------------------
// Route-intercept helpers
// ---------------------------------------------------------------------------

/**
 * Set up all API mocks that a fully-authenticated transactions page needs on
 * initial load:
 *   - GET /api/households/me       → household (for householdGuard)
 *   - GET /api/transactions        → list of transactions
 *   - GET /api/categories          → list of categories (for the add form)
 */
async function mockApiDefaults(page: Page): Promise<void> {
  // householdGuard checks this on first visit
  await page.route('**/api/households/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_HOUSEHOLD) }),
  );

  // TransactionListComponent.load() on ngOnInit
  await page.route('**/api/transactions**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_TRANSACTIONS) }),
  );

  // TransactionFormComponent.ngOnInit() fetches categories
  await page.route('**/api/categories**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CATEGORIES) }),
  );
}

// ---------------------------------------------------------------------------
// 1. Unauthenticated redirect
// ---------------------------------------------------------------------------

test.describe('Route guard — unauthenticated', () => {
  test('visiting /transactions without a token redirects to /login', async ({ page }) => {
    // Navigate to the app root first so we are on the correct origin,
    // then clear any leftover token before hitting the guarded route.
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('fm_access_token'));

    await page.goto('/transactions');

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 2. Authenticated user sees the transactions page
// ---------------------------------------------------------------------------

test.describe('Transactions page — authenticated', () => {
  test('shows the transactions page with a month selector when authenticated and has household', async ({ page }) => {
    await mockApiDefaults(page);

    const txPage = new TransactionsPage(page);
    await txPage.gotoAuthenticated(FAKE_TOKEN);

    await txPage.isLoaded();

    // Month selector should contain the current month as an option
    await expect(txPage.monthSelector).toBeVisible();
    const options = await txPage.monthSelector.locator('option').allTextContents();
    expect(options.some(opt => opt.trim() === CURRENT_MONTH)).toBe(true);

    // Both mock transactions should be visible in the table
    await expect(txPage.transactionRows).toHaveCount(2);
  });
});

// ---------------------------------------------------------------------------
// 3. Toggle the Add Transaction form
// ---------------------------------------------------------------------------

test.describe('Add Transaction form toggle', () => {
  test('clicking "Add Transaction" shows the form; clicking again hides it', async ({ page }) => {
    await mockApiDefaults(page);

    const txPage = new TransactionsPage(page);
    await txPage.gotoAuthenticated(FAKE_TOKEN);
    await txPage.isLoaded();

    // Form is hidden by default
    await expect(txPage.transactionForm).not.toBeVisible();

    // First click — form appears
    await txPage.toggleForm();
    await expect(txPage.transactionForm).toBeVisible();

    // Second click — form disappears
    await txPage.toggleForm();
    await expect(txPage.transactionForm).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 4. Form validation — empty amount
// ---------------------------------------------------------------------------

test.describe('Form validation', () => {
  test('submitting with an empty amount shows a validation error and keeps the form open', async ({ page }) => {
    await mockApiDefaults(page);

    const txPage = new TransactionsPage(page);
    await txPage.gotoAuthenticated(FAKE_TOKEN);
    await txPage.isLoaded();

    // Open the form
    await txPage.toggleForm();
    await expect(txPage.transactionForm).toBeVisible();

    // Touch the amount field to trigger Angular's touched state, then leave it empty
    await txPage.touchAmountField();

    // The submit button should be disabled because amount is required & invalid
    expect(await txPage.submitIsDisabled()).toBe(true);

    // The amount validation error message should be visible
    await txPage.amountErrorIsVisible();

    // Form is still visible — not submitted
    await expect(txPage.transactionForm).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 5. Add a transaction (mocked POST)
// ---------------------------------------------------------------------------

test.describe('Add transaction', () => {
  test('filling in the form and submitting calls POST /api/transactions and collapses the form', async ({ page }) => {
    // Track how many times the GET /api/transactions endpoint is called
    let getTransactionsCalls = 0;
    let postCalled = false;

    await page.route('**/api/households/me', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_HOUSEHOLD) }),
    );

    await page.route('**/api/categories**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CATEGORIES) }),
    );

    // GET /api/transactions (with optional ?month=... query): first call returns 2
    // items; second call (triggered by onSaved → load()) returns 3.
    // POST /api/transactions: return the newly created transaction.
    // The pattern **/api/transactions** covers both the bare URL and ?month=... variants.
    await page.route('**/api/transactions**', route => {
      const method = route.request().method();
      // Exclude sub-resource paths like /transactions/txn-1
      const url = route.request().url();
      if (url.match(/\/api\/transactions\/[^?]+/)) {
        return route.continue();
      }
      if (method === 'GET') {
        getTransactionsCalls++;
        const body = getTransactionsCalls === 1
          ? MOCK_TRANSACTIONS
          : [...MOCK_TRANSACTIONS, NEW_TRANSACTION];
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      }
      // POST
      postCalled = true;
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(NEW_TRANSACTION) });
    });

    const txPage = new TransactionsPage(page);
    await txPage.gotoAuthenticated(FAKE_TOKEN);
    await txPage.isLoaded();

    // Open form
    await txPage.toggleForm();
    await expect(txPage.transactionForm).toBeVisible();

    // Fill in valid values
    await txPage.fillAmount('25.00');
    await txPage.selectType('expense');
    await txPage.fillDescription('Coffee');
    await txPage.fillDate(TODAY);

    // Submit
    await txPage.submitForm();

    // Form should close after a successful save (component emits (saved))
    await expect(txPage.transactionForm).not.toBeVisible({ timeout: 10_000 });

    // POST was intercepted
    expect(postCalled).toBe(true);

    // The list reloads — now 3 rows
    await expect(txPage.transactionRows).toHaveCount(3, { timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 6. Delete a transaction (mocked DELETE, native confirm dialog)
// ---------------------------------------------------------------------------

test.describe('Delete transaction', () => {
  test('clicking Delete, accepting the confirm dialog, calls DELETE and removes the row', async ({ page }) => {
    let deleteCalled = false;
    let getTransactionsCalls = 0;

    await page.route('**/api/households/me', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_HOUSEHOLD) }),
    );

    await page.route('**/api/categories**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CATEGORIES) }),
    );

    // Register the generic GET handler first.
    // Playwright matches routes in LIFO order (last registered = first matched),
    // so registering the specific /txn-1 handler AFTER the generic one ensures
    // the specific route takes priority for DELETE /api/transactions/txn-1.
    await page.route('**/api/transactions**', route => {
      const method = route.request().method();
      if (method === 'GET') {
        getTransactionsCalls++;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_TRANSACTIONS),
        });
      }
      // Any other method falls through to the more-specific handler below
      return route.continue();
    });

    // Specific DELETE handler for /api/transactions/txn-1 (registered last = highest priority)
    await page.route('**/api/transactions/txn-1', route => {
      if (route.request().method() === 'DELETE') {
        deleteCalled = true;
        return route.fulfill({ status: 204, body: '' });
      }
      return route.continue();
    });

    const txPage = new TransactionsPage(page);

    // Accept the native confirm() dialog automatically
    page.on('dialog', dialog => dialog.accept());

    await txPage.gotoAuthenticated(FAKE_TOKEN);
    await txPage.isLoaded();

    // Confirm 2 rows visible
    await expect(txPage.transactionRows).toHaveCount(2);

    // Click delete on the first row (txn-1)
    await txPage.deleteTransactionAt(0);

    // DELETE was intercepted
    expect(deleteCalled).toBe(true);

    // The component removes the row from its local array without a reload —
    // so we expect 1 row remaining.
    await expect(txPage.transactionRows).toHaveCount(1, { timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 7. Changing the month selector triggers a new GET for that month
// ---------------------------------------------------------------------------

test.describe('Month selector', () => {
  test('selecting a different month sends a GET /api/transactions?month=<selected>', async ({ page }) => {
    const requestedMonths: string[] = [];

    await page.route('**/api/households/me', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_HOUSEHOLD) }),
    );

    await page.route('**/api/categories**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CATEGORIES) }),
    );

    await page.route('**/api/transactions**', route => {
      const url = new URL(route.request().url());
      const month = url.searchParams.get('month');
      if (month) requestedMonths.push(month);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    const txPage = new TransactionsPage(page);
    await txPage.gotoAuthenticated(FAKE_TOKEN);
    await txPage.isLoaded();

    // Change to past month
    await txPage.selectMonth(PAST_MONTH);

    // Wait until the new GET fires — the list may be empty (mock returns [])
    await expect(txPage.transactionRows).toHaveCount(0, { timeout: 10_000 });

    // The interceptor should have captured a request with ?month=<PAST_MONTH>
    expect(requestedMonths).toContain(PAST_MONTH);
  });
});
