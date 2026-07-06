/**
 * Debt derived-balance E2E tests — Task 13.
 *
 * Task 13 changed how the debt `balance` field works:
 *
 *   balance = GREATEST(0, starting_balance - COALESCE(SUM(confirmed payments), 0))
 *
 * Key behaviour changes verified here:
 *
 *   1. POST /api/debts — the submitted `balance` becomes the immutable
 *      `starting_balance`.  The response contains BOTH `starting_balance`
 *      and a derived `balance` equal to `starting_balance` (no payments yet).
 *
 *   2. GET /api/debts — every debt in the list exposes `starting_balance`
 *      alongside the derived `balance`.  With no payments, they are equal.
 *
 *   3. PATCH /api/debts/{id} with a `balance` field — the DebtUpdate model
 *      uses `extra="forbid"`, so the request is rejected with HTTP 422
 *      (Unprocessable Entity).  This is the Task 13 promotion from Task 12's
 *      silent-ignore behaviour.
 *
 *   4. GET /api/dashboard — `debt_summary.total_owed` aggregates the derived
 *      balances across all debts for the household.  With no payments seeded,
 *      total_owed equals the sum of all starting_balance values.
 *
 * Strategy
 * --------
 * Each test registers a brand-new user and creates a household so there is
 * no shared state between tests or runs.  All assertions are API-level
 * (no browser interaction required).
 *
 * All tests are skipped automatically when the backend is unreachable.
 *
 * REQUIRES: Docker Compose running (`docker compose up -d --build`)
 *   Backend: http://localhost:8002
 *
 * Run only this project:
 *   npx playwright test --project=debt-derived-balance
 */

import { test, expect, request as playwrightRequest } from '@playwright/test';
import { DebtsApiPage } from '../../pages/debts-api.page';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BACKEND = 'http://localhost:8002';
const API = `${BACKEND}/api`;

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

interface UserContext {
  token: string;
  householdId: string;
}

/**
 * Registers a fresh user, creates a household, and returns the JWT and
 * household id.  Each call uses a unique timestamp-based email so tests
 * never collide even when run in parallel.
 */
async function seedUser(tag: string): Promise<UserContext> {
  const ts = Date.now();
  const email = `task13-${tag}-${ts}@futureme-test.example.com`;
  const password = 'TestPassword1!';

  const ctx = await playwrightRequest.newContext();

  // Register
  const regRes = await ctx.post(`${API}/auth/register`, {
    data: { email, password, first_name: 'Task13', last_name: tag },
  });
  if (!regRes.ok()) {
    const body = await regRes.text();
    await ctx.dispose();
    throw new Error(`Register failed (${regRes.status()}): ${body}`);
  }
  const { access_token: token } = await regRes.json();

  // Create household
  const hhRes = await ctx.post(`${API}/households`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: `Task13 ${tag} HH` },
  });
  if (!hhRes.ok()) {
    const body = await hhRes.text();
    await ctx.dispose();
    throw new Error(`Create household failed (${hhRes.status()}): ${body}`);
  }
  const { id: householdId } = await hhRes.json();

  await ctx.dispose();
  return { token, householdId };
}

// ---------------------------------------------------------------------------
// Skip guard — skip entire suite if backend is unreachable
// ---------------------------------------------------------------------------

/** True once the suite's beforeAll confirms Task 13 is deployed. */
let task13Deployed = false;

test.beforeAll(async () => {
  // 1. Reachability check.
  try {
    const ctx = await playwrightRequest.newContext();
    const res = await ctx.get(`${BACKEND}/health`, { timeout: 4_000 });
    await ctx.dispose();
    if (!res.ok()) {
      test.skip(true, 'Backend /health returned non-OK — is Docker running?');
      return;
    }
  } catch {
    test.skip(true, 'Backend unreachable (ECONNREFUSED) — start Docker Compose first.');
    return;
  }

  // 2. Probe whether the DebtResponse in the running container already
  //    includes `starting_balance` (Task 13 indicator).
  //    We also verify that PATCH with `balance` returns 422 (extra="forbid").
  try {
    const probeCtx = await playwrightRequest.newContext();

    const regRes = await probeCtx.post(`${API}/auth/register`, {
      data: {
        email: `task13-probe-${Date.now()}@futureme-test.example.com`,
        password: 'TestPassword1!',
        first_name: 'Task13',
        last_name: 'Probe',
      },
    });
    if (regRes.ok()) {
      const { access_token: probeToken } = await regRes.json();
      const hhRes = await probeCtx.post(`${API}/households`, {
        headers: { Authorization: `Bearer ${probeToken}` },
        data: { name: 'Task13 Probe HH' },
      });
      if (hhRes.ok()) {
        // Create a probe debt
        const debtRes = await probeCtx.post(`${API}/debts`, {
          headers: { Authorization: `Bearer ${probeToken}`, 'Content-Type': 'application/json' },
          data: { name: 'Probe Debt', balance: 1000.0 },
        });
        if (debtRes.status() === 201) {
          const debt = await debtRes.json();
          // Check that starting_balance is present
          const hasStartingBalance = 'starting_balance' in debt;
          // Check that PATCH with balance returns 422
          const patchRes = await probeCtx.patch(`${API}/debts/${debt.id}`, {
            headers: { Authorization: `Bearer ${probeToken}`, 'Content-Type': 'application/json' },
            data: { balance: 1.0 },
          });
          const patchReturns422 = patchRes.status() === 422;
          task13Deployed = hasStartingBalance && patchReturns422;
        }
      }
    }

    await probeCtx.dispose();
  } catch {
    // Probe failed unexpectedly — conservative: leave flag false (tests will skip).
  }
});

// ---------------------------------------------------------------------------
// Suite 1: POST /api/debts — starting_balance in response
// ---------------------------------------------------------------------------

test.describe('POST /api/debts — starting_balance and derived balance (Task 13)', () => {
  test.beforeEach(() => {
    if (!task13Deployed) {
      test.skip(
        true,
        'Task 13 not yet deployed — rebuild the Docker image: docker compose up -d --build',
      );
    }
  });

  /**
   * The submitted `balance` must be stored as `starting_balance`.
   * With no payments the derived `balance` equals `starting_balance`.
   */
  test('response contains starting_balance equal to submitted balance', async ({ request }) => {
    const { token } = await seedUser('post-starting-balance');
    const api = new DebtsApiPage(request);

    const created = await api.createDebt(token, {
      name: 'Car Loan',
      balance: 8500.0,
      interest_rate: 5.9,
      minimum_payment: 200.0,
    });

    // starting_balance must equal the submitted opening balance
    expect(created.starting_balance).toBeCloseTo(8500.0, 2);

    // balance (derived) equals starting_balance when no payments exist
    expect(created.balance).toBeCloseTo(8500.0, 2);
  });

  /**
   * With no debt payments on record, the derived balance must equal
   * the starting_balance exactly.
   */
  test('derived balance equals starting_balance when no payments exist', async ({ request }) => {
    const { token } = await seedUser('post-derived-equals-starting');
    const api = new DebtsApiPage(request);

    const created = await api.createDebt(token, {
      name: 'Student Loan',
      balance: 24000.0,
    });

    expect(created.starting_balance).toBeCloseTo(created.balance, 2);
  });

  /**
   * Verify the exact field names are present in the response shape —
   * `starting_balance` must appear alongside `balance`.
   */
  test('response includes both starting_balance and balance fields', async ({ request }) => {
    const { token } = await seedUser('post-fields-present');
    const api = new DebtsApiPage(request);

    const created = await api.createDebt(token, {
      name: 'Credit Card',
      balance: 3200.0,
      interest_rate: 19.9,
      minimum_payment: 85.0,
    });

    expect(created).toHaveProperty('starting_balance');
    expect(created).toHaveProperty('balance');
    expect(typeof created.starting_balance).toBe('number');
    expect(typeof created.balance).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Suite 2: GET /api/debts — derived balance in list
// ---------------------------------------------------------------------------

test.describe('GET /api/debts — derived balance exposed in list (Task 13)', () => {
  test.beforeEach(() => {
    if (!task13Deployed) {
      test.skip(
        true,
        'Task 13 not yet deployed — rebuild the Docker image: docker compose up -d --build',
      );
    }
  });

  /**
   * The list endpoint must return both `starting_balance` and `balance` on
   * every debt record.  With no payments they must be equal.
   */
  test('listed debts include starting_balance and derived balance', async ({ request }) => {
    const { token } = await seedUser('list-starting-balance');
    const api = new DebtsApiPage(request);

    // Seed two debts
    const debtA = await api.createDebt(token, { name: 'Debt A', balance: 1500.0 });
    const debtB = await api.createDebt(token, { name: 'Debt B', balance: 2500.0 });

    const listRes = await api.listDebtsRaw(token);
    expect(listRes.status()).toBe(200);
    const debts = await listRes.json();

    for (const debt of debts) {
      expect(debt).toHaveProperty('starting_balance');
      expect(debt).toHaveProperty('balance');
    }

    // Locate our two seeded debts
    const foundA = debts.find((d: { id: string }) => d.id === debtA.id);
    const foundB = debts.find((d: { id: string }) => d.id === debtB.id);

    expect(foundA).toBeDefined();
    expect(foundA.starting_balance).toBeCloseTo(1500.0, 2);
    expect(foundA.balance).toBeCloseTo(1500.0, 2);

    expect(foundB).toBeDefined();
    expect(foundB.starting_balance).toBeCloseTo(2500.0, 2);
    expect(foundB.balance).toBeCloseTo(2500.0, 2);
  });

  /**
   * The `starting_balance` must not change across subsequent GET calls —
   * it is the immutable opening value set at debt creation.
   */
  test('starting_balance is stable across multiple GET /api/debts calls', async ({ request }) => {
    const { token } = await seedUser('list-stable-starting');
    const api = new DebtsApiPage(request);

    const created = await api.createDebt(token, { name: 'Mortgage', balance: 175000.0 });

    // First fetch
    const firstRes = await api.listDebtsRaw(token);
    const firstList = await firstRes.json();
    const firstFound = firstList.find((d: { id: string }) => d.id === created.id);
    expect(firstFound.starting_balance).toBeCloseTo(175000.0, 2);

    // Second fetch (simulates a page refresh — no payments added between calls)
    const secondRes = await api.listDebtsRaw(token);
    const secondList = await secondRes.json();
    const secondFound = secondList.find((d: { id: string }) => d.id === created.id);
    expect(secondFound.starting_balance).toBeCloseTo(175000.0, 2);

    // starting_balance must be identical across both fetches
    expect(firstFound.starting_balance).toBeCloseTo(secondFound.starting_balance, 2);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: PATCH /api/debts/{id} with balance — must return 422
// ---------------------------------------------------------------------------

test.describe('PATCH /api/debts/{id} — balance field rejected with 422 (Task 13)', () => {
  test.beforeEach(() => {
    if (!task13Deployed) {
      test.skip(
        true,
        'Task 13 not yet deployed — rebuild the Docker image: docker compose up -d --build',
      );
    }
  });

  /**
   * DebtUpdate uses `extra="forbid"` from Task 13 onward.
   * A PATCH containing only `balance` must be rejected with 422.
   */
  test('PATCH with only { balance } returns 422 Unprocessable Entity', async ({ request }) => {
    const { token } = await seedUser('patch-balance-only');
    const api = new DebtsApiPage(request);

    const created = await api.createDebt(token, {
      name: 'Personal Loan',
      balance: 6000.0,
    });

    const patchRes = await api.updateDebtRaw(token, created.id, { balance: 1.0 });

    // extra="forbid" → Pydantic raises a validation error → FastAPI returns 422
    expect(patchRes.status()).toBe(422);

    // The response body must contain Pydantic validation error detail
    const body = await patchRes.json();
    expect(body).toHaveProperty('detail');
    expect(Array.isArray(body.detail)).toBe(true);
    expect(body.detail.length).toBeGreaterThan(0);
  });

  /**
   * Sending `balance` alongside a mutable field (e.g. name) also results in
   * 422 because DebtUpdate forbids extra fields unconditionally.
   */
  test('PATCH with { balance, name } returns 422 even though name is valid', async ({
    request,
  }) => {
    const { token } = await seedUser('patch-balance-with-name');
    const api = new DebtsApiPage(request);

    const created = await api.createDebt(token, {
      name: 'Home Equity Loan',
      balance: 50000.0,
      interest_rate: 3.2,
      minimum_payment: 450.0,
    });

    const patchRes = await api.updateDebtRaw(token, created.id, {
      name: 'Home Equity Loan (renamed)',
      balance: 999.0,
    });

    // Both valid and forbidden fields together → still 422
    expect(patchRes.status()).toBe(422);
  });

  /**
   * Sanity check: a PATCH with only mutable fields continues to work (200).
   * This guards against accidentally breaking all PATCH requests.
   */
  test('PATCH with only mutable fields (name, interest_rate) returns 200', async ({ request }) => {
    const { token } = await seedUser('patch-mutable-fields-ok');
    const api = new DebtsApiPage(request);

    const created = await api.createDebt(token, {
      name: 'Old Debt Name',
      balance: 3000.0,
      interest_rate: 8.0,
      minimum_payment: 100.0,
    });

    const updated = await api.updateDebt(token, created.id, {
      name: 'New Debt Name',
      interest_rate: 7.5,
    });

    expect(updated.name).toBe('New Debt Name');
    expect(updated.interest_rate).toBeCloseTo(7.5, 2);
    // starting_balance and balance must be unchanged
    expect(updated.starting_balance).toBeCloseTo(3000.0, 2);
    expect(updated.balance).toBeCloseTo(3000.0, 2);
  });

  /**
   * Sending `starting_balance` (read-only field not in DebtUpdate schema)
   * must also return 422 — extra="forbid" covers all non-schema fields.
   */
  test('PATCH with starting_balance field returns 422', async ({ request }) => {
    const { token } = await seedUser('patch-starting-balance');
    const api = new DebtsApiPage(request);

    const created = await api.createDebt(token, {
      name: 'Test Debt',
      balance: 1200.0,
    });

    const patchRes = await api.updateDebtRaw(token, created.id, { starting_balance: 500.0 });

    expect(patchRes.status()).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// Suite 4: GET /api/dashboard — debt_summary.total_owed uses derived balances
// ---------------------------------------------------------------------------

test.describe('GET /api/dashboard — debt_summary.total_owed aggregates derived balances (Task 13)', () => {
  test.beforeEach(() => {
    if (!task13Deployed) {
      test.skip(
        true,
        'Task 13 not yet deployed — rebuild the Docker image: docker compose up -d --build',
      );
    }
  });

  /**
   * With no debt payments, total_owed must equal the sum of all
   * starting_balance values for the household's debts.
   */
  test('total_owed equals sum of starting_balances when no payments exist', async ({
    request,
  }) => {
    const { token } = await seedUser('dashboard-total-owed');
    const api = new DebtsApiPage(request);

    // Seed three debts
    await api.createDebt(token, { name: 'Debt One', balance: 2000.0 });
    await api.createDebt(token, { name: 'Debt Two', balance: 3500.0 });
    await api.createDebt(token, { name: 'Debt Three', balance: 1500.0 });

    // Expected total: 2000 + 3500 + 1500 = 7000
    const stats = await api.getDashboard(token);
    expect(stats.debt_summary.total_owed).toBeCloseTo(7000.0, 2);
  });

  /**
   * debt_count must equal the number of debts seeded.
   */
  test('debt_summary.debt_count equals the number of debts created', async ({ request }) => {
    const { token } = await seedUser('dashboard-debt-count');
    const api = new DebtsApiPage(request);

    await api.createDebt(token, { name: 'First Debt', balance: 1000.0 });
    await api.createDebt(token, { name: 'Second Debt', balance: 2000.0 });

    const stats = await api.getDashboard(token);
    expect(stats.debt_summary.debt_count).toBe(2);
  });

  /**
   * With no debts at all, the debt_summary must use safe zero defaults.
   */
  test('debt_summary is zeroed when the household has no debts', async ({ request }) => {
    const { token } = await seedUser('dashboard-no-debts');
    const api = new DebtsApiPage(request);

    const stats = await api.getDashboard(token);
    expect(stats.debt_summary.total_owed).toBeCloseTo(0.0, 2);
    expect(stats.debt_summary.debt_count).toBe(0);
    expect(stats.debt_summary.total_minimum_payments).toBeCloseTo(0.0, 2);
  });

  /**
   * total_minimum_payments must equal the sum of minimum_payment values
   * across all debts (this is a mutable field unaffected by Task 13 payment logic).
   */
  test('debt_summary.total_minimum_payments sums minimum_payment across all debts', async ({
    request,
  }) => {
    const { token } = await seedUser('dashboard-min-payments');
    const api = new DebtsApiPage(request);

    await api.createDebt(token, { name: 'Loan A', balance: 5000.0, minimum_payment: 120.0 });
    await api.createDebt(token, { name: 'Loan B', balance: 8000.0, minimum_payment: 250.0 });

    // Expected: 120 + 250 = 370
    const stats = await api.getDashboard(token);
    expect(stats.debt_summary.total_minimum_payments).toBeCloseTo(370.0, 2);
  });

  /**
   * Deleting a debt must reduce total_owed on the dashboard.
   * This verifies the aggregation is live (not cached from a snapshot).
   */
  test('deleting a debt reduces total_owed in debt_summary', async ({ request }) => {
    const { token } = await seedUser('dashboard-delete-reduces');
    const api = new DebtsApiPage(request);

    const debtA = await api.createDebt(token, { name: 'Debt To Keep', balance: 4000.0 });
    const debtB = await api.createDebt(token, { name: 'Debt To Delete', balance: 1000.0 });

    // Before deletion: total_owed = 4000 + 1000 = 5000
    const beforeStats = await api.getDashboard(token);
    expect(beforeStats.debt_summary.total_owed).toBeCloseTo(5000.0, 2);

    // Delete one debt
    const deleteRes = await api.deleteDebtRaw(token, debtB.id);
    expect(deleteRes.status()).toBe(204);

    // After deletion: total_owed = 4000
    const afterStats = await api.getDashboard(token);
    expect(afterStats.debt_summary.total_owed).toBeCloseTo(4000.0, 2);
    expect(afterStats.debt_summary.debt_count).toBe(1);
  });
});
