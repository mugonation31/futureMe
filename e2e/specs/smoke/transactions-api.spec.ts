/**
 * Transactions & Categories API — E2E smoke tests
 *
 * All requests go directly to the FastAPI backend (port 8002).
 * No browser is involved — these tests use Playwright's `request` fixture only.
 *
 * REQUIRES: Docker Compose running (`docker compose up -d --build`)
 *   docker compose up -d --build
 *
 * Run just this file:
 *   npx playwright test --project=transactions-api
 *
 * Scenarios covered:
 *   1.  Register a new user → login → receive JWT
 *   2.  Authenticated user without household → GET /api/categories returns 403
 *   3.  Create household → GET /api/categories returns default categories
 *   4.  Create custom category → appears in GET /api/categories list
 *   5.  Create an expense transaction with a category
 *   6.  Create an income transaction (no category)
 *   7.  GET /api/transactions returns both transactions
 *   8.  GET /api/transactions?month=YYYY-MM filters to matching month only
 *   9.  GET /api/transactions/{id} returns the single transaction
 *   10. PATCH /api/transactions/{id} updates the amount
 *   11. DELETE /api/transactions/{id} returns 204
 *   12. Second user in same household can see transactions from first user
 *   13. User NOT in the household cannot access household transactions
 */

import { test, expect } from '@playwright/test';
import { TransactionsApiPage } from '../../pages/transactions-api.page';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NOW = Date.now();

/** Unique per-run email to avoid "already registered" collisions. */
function uniqueEmail(role: string): string {
  return `e2e.${role}.${NOW}@futureme-test.example.com`;
}

const OWNER_EMAIL = uniqueEmail('owner');
const OWNER_PASSWORD = 'TestPassword1!';
const OWNER_NAME = 'E2E Owner';

const MEMBER_EMAIL = uniqueEmail('member');
const MEMBER_PASSWORD = 'TestPassword1!';
const MEMBER_NAME = 'E2E Member';

const OUTSIDER_EMAIL = uniqueEmail('outsider');
const OUTSIDER_PASSWORD = 'TestPassword1!';
const OUTSIDER_NAME = 'E2E Outsider';

/**
 * The "current" month in YYYY-MM format (used for same-month transactions).
 * A second month value is used for the filter test.
 */
const CURRENT_MONTH = new Date().toISOString().slice(0, 7); // e.g. "2026-06"
const CURRENT_DATE = new Date().toISOString().slice(0, 10); // e.g. "2026-06-08"

// A date in a different month — subtract one month, clamped to the 1st.
const pastDate = new Date();
pastDate.setMonth(pastDate.getMonth() - 1);
pastDate.setDate(1);
const PAST_DATE = pastDate.toISOString().slice(0, 10);           // e.g. "2026-05-01"
const PAST_MONTH = pastDate.toISOString().slice(0, 7);           // e.g. "2026-05"

// ---------------------------------------------------------------------------
// beforeAll: skip entire suite when backend is unreachable
// ---------------------------------------------------------------------------

test.beforeAll(async ({ request }) => {
  try {
    const res = await request.get('http://localhost:8002/health', { timeout: 4_000 });
    if (!res.ok()) {
      test.skip(true, 'Backend /health returned non-OK — is Docker running?');
    }
  } catch {
    test.skip(true, 'Backend unreachable (ECONNREFUSED) — start Docker Compose first.');
  }
});

// ---------------------------------------------------------------------------
// Shared state — populated by earlier tests, consumed by later ones.
// Because Playwright runs tests sequentially within a file (workers=1),
// using module-level variables here is intentional and safe.
// ---------------------------------------------------------------------------

let ownerToken = '';
let memberToken = '';
let outsiderToken = '';
let householdInviteCode = '';
let customCategoryId = '';
let expenseTxnId = '';
let incomeTxnId = '';

// ---------------------------------------------------------------------------
// 1. Register → Login → JWT
// ---------------------------------------------------------------------------

test.describe('Authentication', () => {
  test('registers a new user and receives a JWT', async ({ request }) => {
    const api = new TransactionsApiPage(request);

    const auth = await api.register(OWNER_EMAIL, OWNER_PASSWORD, OWNER_NAME);

    expect(auth.access_token).toBeTruthy();
    expect(typeof auth.access_token).toBe('string');
    expect(auth.user.email).toBe(OWNER_EMAIL);

    ownerToken = auth.access_token;
  });

  test('logs in with registered credentials and receives a JWT', async ({ request }) => {
    const api = new TransactionsApiPage(request);

    const auth = await api.login(OWNER_EMAIL, OWNER_PASSWORD);

    expect(auth.access_token).toBeTruthy();
    expect(auth.user.email).toBe(OWNER_EMAIL);

    // Refresh token (could differ from registration token on repeated runs)
    ownerToken = auth.access_token;
  });

  test('registers the second (member) user', async ({ request }) => {
    const api = new TransactionsApiPage(request);

    const auth = await api.register(MEMBER_EMAIL, MEMBER_PASSWORD, MEMBER_NAME);

    expect(auth.access_token).toBeTruthy();
    memberToken = auth.access_token;
  });

  test('registers the outsider user (no household)', async ({ request }) => {
    const api = new TransactionsApiPage(request);

    const auth = await api.register(OUTSIDER_EMAIL, OUTSIDER_PASSWORD, OUTSIDER_NAME);

    expect(auth.access_token).toBeTruthy();
    outsiderToken = auth.access_token;
  });
});

// ---------------------------------------------------------------------------
// 2. 403 on categories when user has no household
// ---------------------------------------------------------------------------

test.describe('Categories — no household guard', () => {
  test('GET /api/categories returns 403 when user has no household', async ({ request }) => {
    test.skip(!ownerToken, 'owner token not yet set — auth tests must run first');

    const api = new TransactionsApiPage(request);

    // ownerToken at this point — owner has registered but NOT yet created a household
    const res = await api.getCategoriesRaw(ownerToken);

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.detail).toMatch(/household/i);
  });
});

// ---------------------------------------------------------------------------
// 3. Create household → default categories appear
// ---------------------------------------------------------------------------

test.describe('Households & default categories', () => {
  test('creates a household for the owner', async ({ request }) => {
    test.skip(!ownerToken, 'owner token not set');

    const api = new TransactionsApiPage(request);
    const household = await api.createHousehold(ownerToken, 'E2E Test Household');

    expect(household.id).toBeTruthy();
    expect(household.name).toBe('E2E Test Household');
    expect(household.invite_code).toBeTruthy();
    expect(household.invite_code.length).toBeGreaterThanOrEqual(6);

    householdInviteCode = household.invite_code;
  });

  test('GET /api/categories returns default (seeded) categories after household creation', async ({ request }) => {
    test.skip(!ownerToken, 'owner token not set');

    const api = new TransactionsApiPage(request);
    const categories = await api.getCategories(ownerToken);

    expect(Array.isArray(categories)).toBe(true);
    expect(categories.length).toBeGreaterThan(0);

    // Every entry is a valid CategoryPayload
    for (const cat of categories) {
      expect(cat.id).toBeTruthy();
      expect(typeof cat.name).toBe('string');
      expect(typeof cat.is_default).toBe('boolean');
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Create custom category → appears in list
// ---------------------------------------------------------------------------

test.describe('Custom categories', () => {
  test('POST /api/categories creates a custom category', async ({ request }) => {
    test.skip(!ownerToken, 'owner token not set');

    const api = new TransactionsApiPage(request);
    const category = await api.createCategory(ownerToken, 'E2E Custom', '🧪', '#ABCDEF');

    expect(category.id).toBeTruthy();
    expect(category.name).toBe('E2E Custom');
    expect(category.is_default).toBe(false);
    expect(category.icon).toBe('🧪');
    expect(category.color).toBe('#ABCDEF');

    customCategoryId = category.id;
  });

  test('custom category appears in GET /api/categories list', async ({ request }) => {
    test.skip(!ownerToken || !customCategoryId, 'dependencies not ready');

    const api = new TransactionsApiPage(request);
    const categories = await api.getCategories(ownerToken);

    const found = categories.find((c) => c.id === customCategoryId);
    expect(found).toBeDefined();
    expect(found!.name).toBe('E2E Custom');
    expect(found!.is_default).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5 & 6. Create expense and income transactions
// ---------------------------------------------------------------------------

test.describe('Create transactions', () => {
  test('POST /api/transactions creates an expense transaction with a category', async ({ request }) => {
    test.skip(!ownerToken || !customCategoryId, 'dependencies not ready');

    const api = new TransactionsApiPage(request);
    const txn = await api.createTransaction(ownerToken, {
      amount: 42.50,
      type: 'expense',
      description: 'E2E Groceries',
      date: CURRENT_DATE,
      category_id: customCategoryId,
    });

    expect(txn.id).toBeTruthy();
    expect(txn.amount).toBeCloseTo(42.50);
    expect(txn.type).toBe('expense');
    expect(txn.description).toBe('E2E Groceries');
    expect(txn.category_id).toBe(customCategoryId);
    expect(txn.date).toBe(CURRENT_DATE);

    expenseTxnId = txn.id;
  });

  test('POST /api/transactions creates an income transaction without a category', async ({ request }) => {
    test.skip(!ownerToken, 'owner token not set');

    const api = new TransactionsApiPage(request);
    const txn = await api.createTransaction(ownerToken, {
      amount: 1500.00,
      type: 'income',
      description: 'E2E Salary',
      date: CURRENT_DATE,
    });

    expect(txn.id).toBeTruthy();
    expect(txn.amount).toBeCloseTo(1500.00);
    expect(txn.type).toBe('income');
    expect(txn.category_id).toBeNull();

    incomeTxnId = txn.id;
  });
});

// ---------------------------------------------------------------------------
// 7. GET /api/transactions returns both transactions
// ---------------------------------------------------------------------------

test.describe('List transactions', () => {
  test('GET /api/transactions returns all household transactions including both created ones', async ({ request }) => {
    test.skip(!ownerToken || !expenseTxnId || !incomeTxnId, 'dependencies not ready');

    const api = new TransactionsApiPage(request);
    const transactions = await api.getTransactions(ownerToken);

    expect(Array.isArray(transactions)).toBe(true);

    const ids = transactions.map((t) => t.id);
    expect(ids).toContain(expenseTxnId);
    expect(ids).toContain(incomeTxnId);
  });
});

// ---------------------------------------------------------------------------
// 8. Month filter
// ---------------------------------------------------------------------------

test.describe('Month filter', () => {
  test('POST /api/transactions creates a transaction in a previous month for filter testing', async ({ request }) => {
    test.skip(!ownerToken, 'owner token not set');

    const api = new TransactionsApiPage(request);
    const txn = await api.createTransaction(ownerToken, {
      amount: 10.00,
      type: 'expense',
      description: 'E2E Old Expense',
      date: PAST_DATE,
    });

    expect(txn.id).toBeTruthy();
    expect(txn.date).toBe(PAST_DATE);
  });

  test('GET /api/transactions?month=CURRENT_MONTH returns only current-month transactions', async ({ request }) => {
    test.skip(!ownerToken || !expenseTxnId || !incomeTxnId, 'dependencies not ready');

    const api = new TransactionsApiPage(request);
    const transactions = await api.getTransactions(ownerToken, CURRENT_MONTH);

    expect(Array.isArray(transactions)).toBe(true);

    // All returned transactions must belong to the queried month
    for (const t of transactions) {
      expect(t.date.slice(0, 7)).toBe(CURRENT_MONTH);
    }

    // The two current-month transactions we created must be present
    const ids = transactions.map((t) => t.id);
    expect(ids).toContain(expenseTxnId);
    expect(ids).toContain(incomeTxnId);
  });

  test('GET /api/transactions?month=PAST_MONTH returns only past-month transactions', async ({ request }) => {
    test.skip(!ownerToken, 'owner token not set');

    const api = new TransactionsApiPage(request);
    const transactions = await api.getTransactions(ownerToken, PAST_MONTH);

    expect(Array.isArray(transactions)).toBe(true);

    // All returned transactions must belong to the queried month
    for (const t of transactions) {
      expect(t.date.slice(0, 7)).toBe(PAST_MONTH);
    }

    // The current-month transactions must NOT appear
    const ids = transactions.map((t) => t.id);
    expect(ids).not.toContain(expenseTxnId);
    expect(ids).not.toContain(incomeTxnId);
  });
});

// ---------------------------------------------------------------------------
// 9. GET /api/transactions/{id}
// ---------------------------------------------------------------------------

test.describe('Get single transaction', () => {
  test('GET /api/transactions/{id} returns the expense transaction', async ({ request }) => {
    test.skip(!ownerToken || !expenseTxnId, 'dependencies not ready');

    const api = new TransactionsApiPage(request);
    const txn = await api.getTransaction(ownerToken, expenseTxnId);

    expect(txn.id).toBe(expenseTxnId);
    expect(txn.amount).toBeCloseTo(42.50);
    expect(txn.type).toBe('expense');
    expect(txn.description).toBe('E2E Groceries');
    expect(txn.category_id).toBe(customCategoryId);
  });

  test('GET /api/transactions/{id} returns 404 for unknown id', async ({ request }) => {
    test.skip(!ownerToken, 'owner token not set');

    const api = new TransactionsApiPage(request);
    const res = await api.getTransactionRaw(ownerToken, '00000000-0000-0000-0000-000000000000');

    expect(res.status()).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 10. PATCH /api/transactions/{id}
// ---------------------------------------------------------------------------

test.describe('Update transaction', () => {
  test('PATCH /api/transactions/{id} updates the amount of the expense transaction', async ({ request }) => {
    test.skip(!ownerToken || !expenseTxnId, 'dependencies not ready');

    const api = new TransactionsApiPage(request);
    const updated = await api.updateTransaction(ownerToken, expenseTxnId, { amount: 99.99 });

    expect(updated.id).toBe(expenseTxnId);
    expect(updated.amount).toBeCloseTo(99.99);
    // Other fields are unchanged
    expect(updated.type).toBe('expense');
    expect(updated.description).toBe('E2E Groceries');
  });

  test('PATCH /api/transactions/{id} reflects new amount in subsequent GET', async ({ request }) => {
    test.skip(!ownerToken || !expenseTxnId, 'dependencies not ready');

    const api = new TransactionsApiPage(request);
    const txn = await api.getTransaction(ownerToken, expenseTxnId);

    expect(txn.amount).toBeCloseTo(99.99);
  });
});

// ---------------------------------------------------------------------------
// 11. DELETE /api/transactions/{id}
// ---------------------------------------------------------------------------

test.describe('Delete transaction', () => {
  test('DELETE /api/transactions/{id} returns 204 for the income transaction', async ({ request }) => {
    test.skip(!ownerToken || !incomeTxnId, 'dependencies not ready');

    const api = new TransactionsApiPage(request);
    const res = await api.deleteTransactionRaw(ownerToken, incomeTxnId);

    expect(res.status()).toBe(204);
  });

  test('income transaction is gone from list after deletion', async ({ request }) => {
    test.skip(!ownerToken || !incomeTxnId, 'dependencies not ready');

    const api = new TransactionsApiPage(request);
    const transactions = await api.getTransactions(ownerToken);

    const ids = transactions.map((t) => t.id);
    expect(ids).not.toContain(incomeTxnId);
  });

  test('GET /api/transactions/{id} returns 404 after deletion', async ({ request }) => {
    test.skip(!ownerToken || !incomeTxnId, 'dependencies not ready');

    const api = new TransactionsApiPage(request);
    const res = await api.getTransactionRaw(ownerToken, incomeTxnId);

    expect(res.status()).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 12. Second user (member of same household) sees owner's transactions
// ---------------------------------------------------------------------------

test.describe('Household member visibility', () => {
  test('member joins the household via invite code', async ({ request }) => {
    test.skip(!memberToken || !householdInviteCode, 'dependencies not ready');

    const api = new TransactionsApiPage(request);
    const res = await api.joinHouseholdRaw(memberToken, householdInviteCode);

    // 200 = joined successfully
    expect(res.status()).toBe(200);
  });

  test('member can see the expense transaction created by the owner', async ({ request }) => {
    test.skip(!memberToken || !expenseTxnId, 'dependencies not ready');

    const api = new TransactionsApiPage(request);
    const transactions = await api.getTransactions(memberToken);

    const ids = transactions.map((t) => t.id);
    expect(ids).toContain(expenseTxnId);
  });

  test('member can GET the expense transaction by id', async ({ request }) => {
    test.skip(!memberToken || !expenseTxnId, 'dependencies not ready');

    const api = new TransactionsApiPage(request);
    const txn = await api.getTransaction(memberToken, expenseTxnId);

    expect(txn.id).toBe(expenseTxnId);
    expect(txn.amount).toBeCloseTo(99.99);
  });
});

// ---------------------------------------------------------------------------
// 13. Outsider (no household) cannot access household transactions
// ---------------------------------------------------------------------------

test.describe('Outsider isolation', () => {
  test('outsider GET /api/transactions returns 403', async ({ request }) => {
    test.skip(!outsiderToken, 'outsider token not set');

    const api = new TransactionsApiPage(request);
    const res = await api.getTransactionsRaw(outsiderToken);

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.detail).toMatch(/household/i);
  });

  test('outsider GET /api/transactions/{id} returns 403', async ({ request }) => {
    test.skip(!outsiderToken || !expenseTxnId, 'dependencies not ready');

    const api = new TransactionsApiPage(request);
    const res = await api.getTransactionRaw(outsiderToken, expenseTxnId);

    // 403 because no household — never gets to the 404 check
    expect(res.status()).toBe(403);
  });

  test('outsider PATCH /api/transactions/{id} returns 403', async ({ request }) => {
    test.skip(!outsiderToken || !expenseTxnId, 'dependencies not ready');

    const api = new TransactionsApiPage(request);
    const res = await api.updateTransactionRaw(outsiderToken, expenseTxnId, { amount: 1.00 });

    expect(res.status()).toBe(403);
  });

  test('outsider DELETE /api/transactions/{id} returns 403', async ({ request }) => {
    test.skip(!outsiderToken || !expenseTxnId, 'dependencies not ready');

    const api = new TransactionsApiPage(request);
    const res = await api.deleteTransactionRaw(outsiderToken, expenseTxnId);

    expect(res.status()).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

test.describe('Input validation', () => {
  test('POST /api/transactions with amount=0 returns 422', async ({ request }) => {
    test.skip(!ownerToken, 'owner token not set');

    const api = new TransactionsApiPage(request);
    const res = await api.createTransactionRaw(ownerToken, {
      amount: 0,
      type: 'expense',
    });

    expect(res.status()).toBe(422);
  });

  test('POST /api/transactions with negative amount returns 422', async ({ request }) => {
    test.skip(!ownerToken, 'owner token not set');

    const api = new TransactionsApiPage(request);
    const res = await api.createTransactionRaw(ownerToken, {
      amount: -5,
      type: 'expense',
    });

    expect(res.status()).toBe(422);
  });

  test('POST /api/transactions with invalid type returns 422', async ({ request }) => {
    test.skip(!ownerToken, 'owner token not set');

    const api = new TransactionsApiPage(request);
    // Bypass TypeScript type by casting
    const res = await api.createTransactionRaw(ownerToken, {
      amount: 10,
      type: 'invalid' as 'expense',
    });

    expect(res.status()).toBe(422);
  });

  test('GET /api/transactions with invalid month format returns 422', async ({ request }) => {
    test.skip(!ownerToken, 'owner token not set');

    const api = new TransactionsApiPage(request);
    const res = await api.getTransactionsRaw(ownerToken, '06-2026');

    expect(res.status()).toBe(422);
  });

  test('unauthenticated POST /api/transactions returns 403', async ({ request }) => {
    const res = await request.post('http://localhost:8002/api/transactions', {
      data: { amount: 10, type: 'expense' },
    });
    // HTTPBearer returns 403 when no credentials provided
    expect([401, 403]).toContain(res.status());
  });
});
