/**
 * Income-Stream CRUD API — E2E smoke tests (Task 23)
 *
 * All requests go directly to the FastAPI backend (port 8002). No browser is
 * involved — these tests use Playwright's `request` fixture only, mirroring the
 * existing household-api / password-reset-api API smoke suites. Task 23 has no
 * frontend surface yet, so this is intentionally API-level only.
 *
 * Endpoints under test (all require `Authorization: Bearer <jwt>`):
 *   POST   /api/budget/{budget_id}/income
 *   PATCH  /api/budget/{budget_id}/income/{income_id}
 *   DELETE /api/budget/{budget_id}/income/{income_id}
 *
 * A budget_id is obtained from GET /api/budget?scope=personal, which
 * auto-creates + seeds the caller's current-month budget on first access.
 *
 * Each test registers its own fresh user (unique email per run) so the suite is
 * fully self-contained and order-independent — no seeded fixtures or env tokens.
 *
 * REQUIRES: Docker Compose running with current backend code
 *           (`docker compose up -d --build`) — the pre-Task-23 image exposes the
 *           retired /api/income route instead and these tests will skip.
 *
 * Run just this file:
 *   npx playwright test --project=income-api
 *
 * Scenarios covered:
 *   1. Happy-path CRUD: create (201) → update (200) → delete (204), and the
 *      parent budget's total_income / income_streams reflect each change.
 *   2. Validation: amount < 0 → 422; blank/whitespace label → 422;
 *      unknown field → 422; unknown field on PATCH → 422.
 *   3. Ownership isolation: user B (no shared household) hitting user A's budget
 *      gets 404 on POST/PATCH/DELETE and causes NO mutation to A's data.
 *   4. Auth: missing bearer token → 403; malformed token → 401.
 */

import { test, expect } from '@playwright/test';
import { IncomeApiPage } from '../../pages/income-api.page';

// ---------------------------------------------------------------------------
// beforeAll: skip the whole suite unless the current backend is reachable
// AND actually exposes the Task 23 route (guards against a stale Docker image).
// ---------------------------------------------------------------------------

test.beforeAll(async ({ request }) => {
  try {
    const health = await request.get('http://localhost:8002/health', { timeout: 4_000 });
    if (!health.ok()) {
      test.skip(true, 'Backend /health returned non-OK — is Docker running?');
      return;
    }
  } catch {
    test.skip(true, 'Backend unreachable (ECONNREFUSED) — start Docker Compose first.');
    return;
  }

  // Confirm the Task 23 route exists. A stale image (pre-Task 23) returns 404
  // for the whole path prefix; the current image returns 401/403 (auth first).
  try {
    const probe = await request.post(
      'http://localhost:8002/api/budget/00000000-0000-0000-0000-000000000000/income',
      { data: { label: 'probe', amount: 1 }, timeout: 4_000 },
    );
    if (probe.status() === 404) {
      test.skip(
        true,
        'POST /api/budget/{id}/income returned 404 for the route prefix — rebuild the image: docker compose up -d --build',
      );
    }
  } catch {
    test.skip(true, 'Failed to probe the income route — check backend logs.');
  }
});

// ---------------------------------------------------------------------------
// 1. Happy-path CRUD
// ---------------------------------------------------------------------------

test.describe('Income CRUD — happy path', () => {
  test('create → update → delete, with budget totals reflecting each step', async ({ request }) => {
    const api = new IncomeApiPage(request);
    const { user, budgetId } = await api.newUserWithBudget('personal');

    // A fresh personal budget starts with no income.
    const initial = await api.getBudget(user.token, 'personal');
    expect(initial.income_streams).toHaveLength(0);
    expect(initial.total_income).toBe(0);

    // CREATE → 201, echoes label/amount, assigns id + position.
    const created = await api.createIncome(user.token, budgetId, {
      label: 'Salary',
      amount: 5000,
    });
    expect(created.budget_id).toBe(budgetId);
    expect(created.label).toBe('Salary');
    expect(created.amount).toBe(5000);
    expect(typeof created.id).toBe('string');
    expect(created.position).toBe(0);

    // Budget now reflects the new stream.
    const afterCreate = await api.getBudget(user.token, 'personal');
    expect(afterCreate.income_streams).toHaveLength(1);
    expect(afterCreate.total_income).toBe(5000);

    // UPDATE → 200, returns the mutated row.
    const updated = await api.updateIncome(user.token, budgetId, created.id, {
      label: 'Salary (raised)',
      amount: 5500,
    });
    expect(updated.id).toBe(created.id);
    expect(updated.label).toBe('Salary (raised)');
    expect(updated.amount).toBe(5500);

    const afterUpdate = await api.getBudget(user.token, 'personal');
    expect(afterUpdate.total_income).toBe(5500);

    // DELETE → 204 (empty body).
    const del = await api.deleteIncomeRaw(user.token, budgetId, created.id);
    expect(del.status()).toBe(204);

    // Budget is back to empty.
    const afterDelete = await api.getBudget(user.token, 'personal');
    expect(afterDelete.income_streams).toHaveLength(0);
    expect(afterDelete.total_income).toBe(0);
  });

  test('empty PATCH body is an accepted no-op (200, row unchanged)', async ({ request }) => {
    const api = new IncomeApiPage(request);
    const { user, budgetId } = await api.newUserWithBudget('personal');
    const created = await api.createIncome(user.token, budgetId, { label: 'Rent', amount: 1200 });

    const res = await api.updateIncomeRaw(user.token, budgetId, created.id, {});
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.label).toBe('Rent');
    expect(body.amount).toBe(1200);
  });
});

// ---------------------------------------------------------------------------
// 2. Validation
// ---------------------------------------------------------------------------

test.describe('Income create/update — input validation', () => {
  test('rejects a negative amount with 422', async ({ request }) => {
    const api = new IncomeApiPage(request);
    const { user, budgetId } = await api.newUserWithBudget('personal');

    const res = await api.createIncomeRaw(user.token, budgetId, { label: 'Bonus', amount: -1 });
    expect(res.status()).toBe(422);
  });

  test('rejects a blank / whitespace-only label with 422', async ({ request }) => {
    const api = new IncomeApiPage(request);
    const { user, budgetId } = await api.newUserWithBudget('personal');

    const res = await api.createIncomeRaw(user.token, budgetId, { label: '   ', amount: 100 });
    expect(res.status()).toBe(422);
  });

  test('rejects an unknown field on create with 422 (extra=forbid)', async ({ request }) => {
    const api = new IncomeApiPage(request);
    const { user, budgetId } = await api.newUserWithBudget('personal');

    const res = await api.createIncomeRaw(user.token, budgetId, {
      label: 'Salary',
      amount: 100,
      unexpected: true,
    });
    expect(res.status()).toBe(422);
  });

  test('rejects an unknown field on update with 422 (extra=forbid)', async ({ request }) => {
    const api = new IncomeApiPage(request);
    const { user, budgetId } = await api.newUserWithBudget('personal');
    const created = await api.createIncome(user.token, budgetId, { label: 'Salary', amount: 100 });

    const res = await api.updateIncomeRaw(user.token, budgetId, created.id, { bogus: 1 });
    expect(res.status()).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// 3. Ownership isolation (the key security behaviour)
// ---------------------------------------------------------------------------

test.describe('Income ownership isolation — cross-tenant access is denied', () => {
  test('a non-owner cannot POST/PATCH/DELETE against another user\'s budget (404, no mutation)', async ({
    request,
  }) => {
    const api = new IncomeApiPage(request);

    // User A owns a budget with one income stream.
    const { user: userA, budgetId: budgetA } = await api.newUserWithBudget('personal');
    const streamA = await api.createIncome(userA.token, budgetA, { label: 'A Salary', amount: 4200 });

    // User B is a separate account in no shared household.
    const userB = await api.registerUser();

    // B → POST into A's budget → 404.
    const bPost = await api.createIncomeRaw(userB.token, budgetA, { label: 'B injects', amount: 99 });
    expect(bPost.status()).toBe(404);

    // B → PATCH A's stream → 404.
    const bPatch = await api.updateIncomeRaw(userB.token, budgetA, streamA.id, { amount: 1 });
    expect(bPatch.status()).toBe(404);

    // B → DELETE A's stream → 404.
    const bDelete = await api.deleteIncomeRaw(userB.token, budgetA, streamA.id);
    expect(bDelete.status()).toBe(404);

    // A's data is completely unchanged: still exactly one stream, same amount.
    const afterAttacks = await api.getBudget(userA.token, 'personal');
    expect(afterAttacks.income_streams).toHaveLength(1);
    expect(afterAttacks.income_streams[0].id).toBe(streamA.id);
    expect(afterAttacks.income_streams[0].label).toBe('A Salary');
    expect(afterAttacks.income_streams[0].amount).toBe(4200);
    expect(afterAttacks.total_income).toBe(4200);
  });
});

// ---------------------------------------------------------------------------
// 4. Auth
// ---------------------------------------------------------------------------

test.describe('Income endpoints — authentication', () => {
  test('a request with no bearer token is rejected (403)', async ({ request }) => {
    const api = new IncomeApiPage(request);
    const { budgetId } = await api.newUserWithBudget('personal');

    // Call the raw endpoint with an empty token → no Authorization header value.
    const res = await request.post(`http://localhost:8002/api/budget/${budgetId}/income`, {
      headers: { 'Content-Type': 'application/json' },
      data: { label: 'X', amount: 1 },
    });
    // FastAPI's HTTPBearer returns 403 when the Authorization header is absent.
    expect([401, 403]).toContain(res.status());
  });

  test('a request with a malformed bearer token is rejected (401)', async ({ request }) => {
    const api = new IncomeApiPage(request);
    const { budgetId } = await api.newUserWithBudget('personal');

    const res = await api.createIncomeRaw('not.a.valid.jwt', budgetId, { label: 'X', amount: 1 });
    expect(res.status()).toBe(401);
  });
});
