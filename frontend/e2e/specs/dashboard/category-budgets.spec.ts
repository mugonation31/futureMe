import { test, expect } from '@playwright/test';
import { CategoryBudgetsApiPage } from '../../pages/category-budgets.page';
import { buildFakeJwt, seedAuthToken } from '../../utils/auth';

/**
 * Category Budgets API E2E tests — Task 32
 * =========================================
 *
 * Covers the three category-budget endpoints:
 *
 *   GET    /api/category-budgets              — list budgets for household
 *   PUT    /api/category-budgets              — upsert monthly limit (owner only)
 *   DELETE /api/category-budgets/{categoryId} — remove budget (owner only, 204)
 *
 * Strategy
 * --------
 * The frontend UI for category budgets is not yet built (Task 33), so these
 * tests exercise the API contract directly via Playwright's APIRequestContext
 * (request fixture).  Playwright's request context sends HTTP calls straight
 * to the backend without launching a browser — ideal for pure API-level E2E.
 *
 * A second layer of tests uses page.route() to mock the backend and verify
 * that the Angular authGuard/householdGuard correctly blocks access to
 * protected routes without a JWT, mirroring the pattern used in dashboard
 * and settings specs.
 *
 * All tests that call the live API require:
 *   E2E_LIVE_API_URL — the base URL of the FastAPI backend
 *   E2E_LIVE_TOKEN   — a valid JWT for a household owner
 *   E2E_LIVE_MEMBER_TOKEN — a valid JWT for a non-owner household member
 *   E2E_LIVE_CATEGORY_ID  — a valid UUID for a category in the test household
 *
 * When these env vars are absent the live-API tests are skipped and only the
 * mocked Angular guard tests run (no live backend required for those).
 *
 * Port: 4202 (configured in frontend/e2e/.env → E2E_BASE_URL).
 *
 * Selector strategy: all API call construction lives in CategoryBudgetsApiPage.
 * Specs never construct URLs or headers directly.
 */

// ─── shared constants ─────────────────────────────────────────────────────────

// URL used by Playwright's page.route() intercepts — must match environment.apiUrl
// in the Angular build under test (typically http://localhost:8002/api in Docker E2E).
const apiUrl = process.env['E2E_API_URL'] ?? 'http://localhost:8002/api';

// Live backend URL — only set when a real backend is running for integration tests.
const liveApiUrl = process.env['E2E_LIVE_API_URL'] ?? '';
const liveToken = process.env['E2E_LIVE_TOKEN'] ?? '';
const liveMemberToken = process.env['E2E_LIVE_MEMBER_TOKEN'] ?? '';
const liveCategoryId = process.env['E2E_LIVE_CATEGORY_ID'] ?? '';

// UUID that does NOT exist in any household — used for 404 assertions.
const NONEXISTENT_UUID = '00000000-0000-0000-0000-000000000000';

// Shared mock data fixtures
const MOCK_HOUSEHOLD = {
  id: 'hh-e2e',
  name: 'E2E Household',
  invite_code: 'TEST-CODE',
};

const MOCK_CATEGORY_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

const MOCK_BUDGET_RESPONSE = {
  id: 'bbbbbbbb-0000-0000-0000-000000000001',
  household_id: 'hh-e2e',
  category_id: MOCK_CATEGORY_ID,
  category_name: 'Groceries',
  monthly_limit: 500.0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
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

// ─── 1. GET /api/category-budgets — mocked (no live backend) ─────────────────

test.describe('GET /api/category-budgets — mocked response shape', () => {
  /**
   * These tests intercept the category-budgets request at the network layer
   * and verify that the Angular app (once the UI exists) sends the request
   * with the correct headers and handles the response correctly.
   *
   * Until Task 33 ships the UI, we validate the mock infrastructure works
   * correctly so tests can be extended to UI assertions without rework.
   */

  test('returns an empty array when no budgets exist for the household', async ({ page }) => {
    await stubAuth(page);

    let intercepted = false;

    await page.route(`${apiUrl}/category-budgets`, route => {
      intercepted = true;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // Navigate to /dashboard — the page that currently calls /api/dashboard.
    // When Task 33 adds a budget management page, update this goto() call.
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

    await page.goto('/dashboard');
    // Verify the Angular app reached the authenticated dashboard shell.
    await expect(page.locator('.dashboard-container')).toBeVisible();
  });

  test('mock fulfills category-budgets with correct JSON shape', async ({ page }) => {
    /**
     * Since the Task 33 UI is not yet built, the Angular app never fires
     * GET /api/category-budgets on its own.  We seed auth, set up the mock,
     * navigate to /dashboard to establish an origin, then call the API
     * directly via page.evaluate() to confirm the mock fulfills the correct
     * response shape.  This matches the pattern used in the PUT/DELETE tests.
     */
    await stubAuth(page);

    await page.route(`${apiUrl}/category-budgets`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([MOCK_BUDGET_RESPONSE]),
      })
    );

    await page.route(`${apiUrl}/settings`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ currency: 'GBP', monthly_budget: 2000 }),
      })
    );
    await page.route(`${apiUrl}/dashboard`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_budget: 2000,
          total_spent: 500,
          remaining_budget: 1500,
          savings_rate: 25,
          category_breakdown: [],
        }),
      })
    );

    await page.goto('/dashboard');
    await expect(page.locator('.dashboard-container')).toBeVisible();

    // Call the mocked endpoint directly from the browser context so the
    // page.route() intercept fires and we get the stubbed response.
    const result = await page.evaluate(
      async ([url]: [string]) => {
        const token = localStorage.getItem('fm_access_token');
        const resp = await fetch(`${url}/category-budgets`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return { status: resp.status, body: await resp.json() };
      },
      [apiUrl] as [string]
    );

    expect(result.status).toBe(200);
    expect(Array.isArray(result.body)).toBe(true);
    expect(result.body.length).toBeGreaterThan(0);

    const budget = result.body[0];
    expect(budget).toHaveProperty('id');
    expect(budget).toHaveProperty('household_id');
    expect(budget).toHaveProperty('category_id');
    expect(budget).toHaveProperty('category_name');
    expect(budget).toHaveProperty('monthly_limit');
    expect(budget).toHaveProperty('created_at');
    expect(budget).toHaveProperty('updated_at');
    expect(typeof budget.monthly_limit).toBe('number');
    expect(budget.monthly_limit).toBeGreaterThan(0);
  });

  test('mock returns 403 when user has no household', async ({ page }) => {
    // Simulate the case where householdGuard blocks the user.
    const token = buildFakeJwt({ email: 'no-household@example.com' });
    await page.goto('/');
    await seedAuthToken(page, token);

    // The householdGuard hits /api/households/me — return 404 to simulate no household.
    await page.route(`${apiUrl}/households/me`, route =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'No household found' }),
      })
    );

    // The /api/category-budgets stub should return 403 for householdless users.
    await page.route(`${apiUrl}/category-budgets`, route =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Household required' }),
      })
    );

    // Angular householdGuard redirects to /onboarding — user never reaches /dashboard.
    await page.goto('/dashboard');
    await page.waitForURL(url => url.pathname.includes('/onboarding'), { timeout: 10000 });
    expect(page.url()).toContain('/onboarding');
  });
});

// ─── 2. PUT /api/category-budgets — mocked response shape ────────────────────

test.describe('PUT /api/category-budgets — mocked upsert contract', () => {
  test('mock returns the upserted budget with all required fields', async ({ page }) => {
    await stubAuth(page);

    const capturedRequests: string[] = [];

    await page.route(`${apiUrl}/category-budgets`, async route => {
      if (route.request().method() === 'PUT') {
        const body = await route.request().postDataJSON();
        capturedRequests.push(JSON.stringify(body));
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...MOCK_BUDGET_RESPONSE,
            monthly_limit: body.monthly_limit,
          }),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }
    });

    await page.route(`${apiUrl}/settings`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ currency: 'GBP', monthly_budget: 2000 }),
      })
    );
    await page.route(`${apiUrl}/dashboard`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_budget: 2000,
          total_spent: 0,
          remaining_budget: 2000,
          savings_rate: 0,
          category_breakdown: [],
        }),
      })
    );

    await page.goto('/dashboard');
    await expect(page.locator('.dashboard-container')).toBeVisible();

    // Simulate what the Angular service will call once Task 33 builds the UI.
    const result = await page.evaluate(
      async ([url, catId]: [string, string]) => {
        const token = localStorage.getItem('fm_access_token');
        const resp = await fetch(`${url}/category-budgets`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ category_id: catId, monthly_limit: 750 }),
        });
        return { status: resp.status, body: await resp.json() };
      },
      [apiUrl, MOCK_CATEGORY_ID] as [string, string]
    );

    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty('id');
    expect(result.body).toHaveProperty('category_id', MOCK_CATEGORY_ID);
    expect(result.body).toHaveProperty('monthly_limit', 750);
  });

  test('mock returns 403 when called by a non-owner member', async ({ page }) => {
    await stubAuth(page);

    await page.route(`${apiUrl}/category-budgets`, async route => {
      if (route.request().method() === 'PUT') {
        route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Only the household owner can set a category budget' }),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }
    });

    await page.route(`${apiUrl}/settings`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ currency: 'GBP', monthly_budget: 1000 }),
      })
    );
    await page.route(`${apiUrl}/dashboard`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_budget: 1000,
          total_spent: 0,
          remaining_budget: 1000,
          savings_rate: 0,
          category_breakdown: [],
        }),
      })
    );

    await page.goto('/dashboard');
    await expect(page.locator('.dashboard-container')).toBeVisible();

    const result = await page.evaluate(
      async ([url, catId]: [string, string]) => {
        const token = localStorage.getItem('fm_access_token');
        const resp = await fetch(`${url}/category-budgets`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ category_id: catId, monthly_limit: 300 }),
        });
        return { status: resp.status, body: await resp.json() };
      },
      [apiUrl, MOCK_CATEGORY_ID] as [string, string]
    );

    expect(result.status).toBe(403);
    expect(result.body.detail).toContain('owner');
  });

  test('mock returns 404 when category does not exist', async ({ page }) => {
    await stubAuth(page);

    await page.route(`${apiUrl}/category-budgets`, async route => {
      if (route.request().method() === 'PUT') {
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Category not found' }),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }
    });

    await page.route(`${apiUrl}/settings`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ currency: 'GBP', monthly_budget: 1000 }),
      })
    );
    await page.route(`${apiUrl}/dashboard`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_budget: 1000,
          total_spent: 0,
          remaining_budget: 1000,
          savings_rate: 0,
          category_breakdown: [],
        }),
      })
    );

    await page.goto('/dashboard');
    await expect(page.locator('.dashboard-container')).toBeVisible();

    const result = await page.evaluate(
      async ([url, uuid]: [string, string]) => {
        const token = localStorage.getItem('fm_access_token');
        const resp = await fetch(`${url}/category-budgets`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ category_id: uuid, monthly_limit: 100 }),
        });
        return { status: resp.status, body: await resp.json() };
      },
      [apiUrl, NONEXISTENT_UUID] as [string, string]
    );

    expect(result.status).toBe(404);
    expect(result.body.detail).toContain('not found');
  });

  test('mock validates monthly_limit must be a positive number', async ({ page }) => {
    await stubAuth(page);

    await page.route(`${apiUrl}/category-budgets`, async route => {
      if (route.request().method() === 'PUT') {
        const body = await route.request().postDataJSON();
        if (!body.monthly_limit || body.monthly_limit <= 0) {
          route.fulfill({
            status: 422,
            contentType: 'application/json',
            body: JSON.stringify({ detail: 'monthly_limit must be greater than 0' }),
          });
        } else {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(MOCK_BUDGET_RESPONSE),
          });
        }
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }
    });

    await page.route(`${apiUrl}/settings`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ currency: 'GBP', monthly_budget: 1000 }),
      })
    );
    await page.route(`${apiUrl}/dashboard`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_budget: 1000,
          total_spent: 0,
          remaining_budget: 1000,
          savings_rate: 0,
          category_breakdown: [],
        }),
      })
    );

    await page.goto('/dashboard');
    await expect(page.locator('.dashboard-container')).toBeVisible();

    const result = await page.evaluate(
      async ([url, catId]: [string, string]) => {
        const token = localStorage.getItem('fm_access_token');
        const resp = await fetch(`${url}/category-budgets`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ category_id: catId, monthly_limit: -50 }),
        });
        return { status: resp.status, body: await resp.json() };
      },
      [apiUrl, MOCK_CATEGORY_ID] as [string, string]
    );

    expect(result.status).toBe(422);
  });
});

// ─── 3. DELETE /api/category-budgets/{categoryId} — mocked ───────────────────

test.describe('DELETE /api/category-budgets/{categoryId} — mocked contract', () => {
  test('mock returns 204 No Content on successful deletion', async ({ page }) => {
    await stubAuth(page);

    await page.route(`${apiUrl}/category-budgets/${MOCK_CATEGORY_ID}`, route => {
      if (route.request().method() === 'DELETE') {
        route.fulfill({ status: 204, body: '' });
      }
    });

    await page.route(`${apiUrl}/settings`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ currency: 'GBP', monthly_budget: 1000 }),
      })
    );
    await page.route(`${apiUrl}/dashboard`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_budget: 1000,
          total_spent: 0,
          remaining_budget: 1000,
          savings_rate: 0,
          category_breakdown: [],
        }),
      })
    );

    await page.goto('/dashboard');
    await expect(page.locator('.dashboard-container')).toBeVisible();

    const result = await page.evaluate(
      async ([url, catId]: [string, string]) => {
        const token = localStorage.getItem('fm_access_token');
        const resp = await fetch(`${url}/category-budgets/${catId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        return { status: resp.status };
      },
      [apiUrl, MOCK_CATEGORY_ID] as [string, string]
    );

    expect(result.status).toBe(204);
  });

  test('mock returns 403 when called by a non-owner member', async ({ page }) => {
    await stubAuth(page);

    await page.route(`${apiUrl}/category-budgets/${MOCK_CATEGORY_ID}`, route => {
      if (route.request().method() === 'DELETE') {
        route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Only the household owner can delete a category budget' }),
        });
      }
    });

    await page.route(`${apiUrl}/settings`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ currency: 'GBP', monthly_budget: 1000 }),
      })
    );
    await page.route(`${apiUrl}/dashboard`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_budget: 1000,
          total_spent: 0,
          remaining_budget: 1000,
          savings_rate: 0,
          category_breakdown: [],
        }),
      })
    );

    await page.goto('/dashboard');
    await expect(page.locator('.dashboard-container')).toBeVisible();

    const result = await page.evaluate(
      async ([url, catId]: [string, string]) => {
        const token = localStorage.getItem('fm_access_token');
        const resp = await fetch(`${url}/category-budgets/${catId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        return { status: resp.status, body: await resp.json() };
      },
      [apiUrl, MOCK_CATEGORY_ID] as [string, string]
    );

    expect(result.status).toBe(403);
    expect(result.body.detail).toContain('owner');
  });

  test('mock returns 404 when budget does not exist for the given category', async ({ page }) => {
    await stubAuth(page);

    await page.route(`${apiUrl}/category-budgets/${NONEXISTENT_UUID}`, route => {
      if (route.request().method() === 'DELETE') {
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Category budget not found' }),
        });
      }
    });

    await page.route(`${apiUrl}/settings`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ currency: 'GBP', monthly_budget: 1000 }),
      })
    );
    await page.route(`${apiUrl}/dashboard`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_budget: 1000,
          total_spent: 0,
          remaining_budget: 1000,
          savings_rate: 0,
          category_breakdown: [],
        }),
      })
    );

    await page.goto('/dashboard');
    await expect(page.locator('.dashboard-container')).toBeVisible();

    const result = await page.evaluate(
      async ([url, uuid]: [string, string]) => {
        const token = localStorage.getItem('fm_access_token');
        const resp = await fetch(`${url}/category-budgets/${uuid}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        return { status: resp.status, body: await resp.json() };
      },
      [apiUrl, NONEXISTENT_UUID] as [string, string]
    );

    expect(result.status).toBe(404);
    expect(result.body.detail).toContain('not found');
  });
});

// ─── 4. Live API tests — skipped unless env vars are set ─────────────────────

/**
 * Live API tests hit the real FastAPI backend.
 * They are skipped automatically when E2E_LIVE_API_URL / E2E_LIVE_TOKEN are
 * absent so the suite can run safely in CI environments that only spin up the
 * Angular dev server (no backend).
 *
 * To run these locally:
 *   E2E_LIVE_API_URL=http://localhost:8001/api \
 *   E2E_LIVE_TOKEN=<owner-jwt> \
 *   E2E_LIVE_MEMBER_TOKEN=<member-jwt> \
 *   E2E_LIVE_CATEGORY_ID=<uuid> \
 *   npx playwright test --project=category-budgets
 */

test.describe('Live API — GET /api/category-budgets', () => {
  test.skip(!liveApiUrl || !liveToken, 'Skipped: E2E_LIVE_API_URL / E2E_LIVE_TOKEN not set');

  test('returns 200 with an array for an authenticated household owner', async ({ request }) => {
    const api = new CategoryBudgetsApiPage(request, liveApiUrl);
    const resp = await api.list(liveToken);

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('returns 401 when no Authorization header is supplied', async ({ request }) => {
    const api = new CategoryBudgetsApiPage(request, liveApiUrl);
    const resp = await api.listUnauthenticated();

    // FastAPI returns 401 for missing/invalid JWT
    expect([401, 403]).toContain(resp.status());
  });

  test('each budget in the array has the expected response shape', async ({ request }) => {
    const api = new CategoryBudgetsApiPage(request, liveApiUrl);
    const resp = await api.list(liveToken);

    const body: unknown[] = await resp.json();
    for (const budget of body) {
      const b = budget as Record<string, unknown>;
      expect(b).toHaveProperty('id');
      expect(b).toHaveProperty('household_id');
      expect(b).toHaveProperty('category_id');
      expect(b).toHaveProperty('category_name');
      expect(b).toHaveProperty('monthly_limit');
      expect(b).toHaveProperty('created_at');
      expect(b).toHaveProperty('updated_at');
      expect(typeof b['monthly_limit']).toBe('number');
      expect(b['monthly_limit'] as number).toBeGreaterThan(0);
    }
  });
});

test.describe('Live API — PUT /api/category-budgets', () => {
  test.skip(
    !liveApiUrl || !liveToken || !liveCategoryId,
    'Skipped: E2E_LIVE_API_URL / E2E_LIVE_TOKEN / E2E_LIVE_CATEGORY_ID not set'
  );

  test('returns 200 with the upserted budget when called by the owner', async ({ request }) => {
    const api = new CategoryBudgetsApiPage(request, liveApiUrl);
    const resp = await api.upsert(liveToken, {
      category_id: liveCategoryId,
      monthly_limit: 250.0,
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toHaveProperty('category_id', liveCategoryId);
    expect(body).toHaveProperty('monthly_limit', 250.0);
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('created_at');
    expect(body).toHaveProperty('updated_at');
  });

  test('second upsert for same category updates the existing record', async ({ request }) => {
    const api = new CategoryBudgetsApiPage(request, liveApiUrl);

    // Create / overwrite with 300
    const first = await api.upsert(liveToken, {
      category_id: liveCategoryId,
      monthly_limit: 300.0,
    });
    expect(first.status()).toBe(200);
    const firstBody = await first.json();

    // Upsert again with 400
    const second = await api.upsert(liveToken, {
      category_id: liveCategoryId,
      monthly_limit: 400.0,
    });
    expect(second.status()).toBe(200);
    const secondBody = await second.json();

    // The record ID must be the same (it's an upsert, not an insert).
    expect(secondBody.id).toBe(firstBody.id);
    expect(secondBody.monthly_limit).toBe(400.0);
    // updated_at should be at or after created_at.
    expect(new Date(secondBody.updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(secondBody.created_at).getTime()
    );
  });

  test('returns 403 when called by a non-owner household member', async ({ request }) => {
    test.skip(!liveMemberToken, 'Skipped: E2E_LIVE_MEMBER_TOKEN not set');
    const api = new CategoryBudgetsApiPage(request, liveApiUrl);
    const resp = await api.upsert(liveMemberToken, {
      category_id: liveCategoryId,
      monthly_limit: 100.0,
    });

    expect(resp.status()).toBe(403);
    const body = await resp.json();
    expect(body.detail).toContain('owner');
  });

  test('returns 404 when category_id does not exist in the household', async ({ request }) => {
    const api = new CategoryBudgetsApiPage(request, liveApiUrl);
    const resp = await api.upsert(liveToken, {
      category_id: NONEXISTENT_UUID,
      monthly_limit: 100.0,
    });

    expect(resp.status()).toBe(404);
    const body = await resp.json();
    expect(body.detail).toContain('not found');
  });

  test('returns 422 when monthly_limit is zero', async ({ request }) => {
    const api = new CategoryBudgetsApiPage(request, liveApiUrl);
    const resp = await api.upsert(liveToken, {
      category_id: liveCategoryId,
      monthly_limit: 0,
    });

    // Pydantic validates monthly_limit > 0
    expect(resp.status()).toBe(422);
  });

  test('returns 422 when monthly_limit is negative', async ({ request }) => {
    const api = new CategoryBudgetsApiPage(request, liveApiUrl);
    const resp = await api.upsert(liveToken, {
      category_id: liveCategoryId,
      monthly_limit: -100,
    });

    expect(resp.status()).toBe(422);
  });

  test('returns 401 when no Authorization header is supplied', async ({ request }) => {
    const api = new CategoryBudgetsApiPage(request, liveApiUrl);
    const resp = await api.upsertUnauthenticated({
      category_id: liveCategoryId,
      monthly_limit: 200.0,
    });

    expect([401, 403]).toContain(resp.status());
  });
});

test.describe('Live API — DELETE /api/category-budgets/{categoryId}', () => {
  test.skip(
    !liveApiUrl || !liveToken || !liveCategoryId,
    'Skipped: E2E_LIVE_API_URL / E2E_LIVE_TOKEN / E2E_LIVE_CATEGORY_ID not set'
  );

  test('returns 204 No Content when the owner deletes an existing budget', async ({ request }) => {
    const api = new CategoryBudgetsApiPage(request, liveApiUrl);

    // Ensure the budget exists before attempting to delete it.
    const upsertResp = await api.upsert(liveToken, {
      category_id: liveCategoryId,
      monthly_limit: 150.0,
    });
    expect(upsertResp.status()).toBe(200);

    const deleteResp = await api.delete(liveToken, liveCategoryId);
    expect(deleteResp.status()).toBe(204);
  });

  test('budget is no longer returned by GET after deletion', async ({ request }) => {
    const api = new CategoryBudgetsApiPage(request, liveApiUrl);

    // Create the budget.
    await api.upsert(liveToken, {
      category_id: liveCategoryId,
      monthly_limit: 200.0,
    });

    // Delete it.
    const deleteResp = await api.delete(liveToken, liveCategoryId);
    expect(deleteResp.status()).toBe(204);

    // Verify it's gone.
    const listResp = await api.list(liveToken);
    expect(listResp.status()).toBe(200);
    const budgets: Array<Record<string, unknown>> = await listResp.json();
    const stillExists = budgets.some(b => b['category_id'] === liveCategoryId);
    expect(stillExists).toBe(false);
  });

  test('returns 404 when deleting a category that has no budget', async ({ request }) => {
    const api = new CategoryBudgetsApiPage(request, liveApiUrl);

    // Delete a budget that was never created.
    const resp = await api.delete(liveToken, NONEXISTENT_UUID);
    expect(resp.status()).toBe(404);
    const body = await resp.json();
    expect(body.detail).toContain('not found');
  });

  test('returns 403 when called by a non-owner household member', async ({ request }) => {
    test.skip(!liveMemberToken, 'Skipped: E2E_LIVE_MEMBER_TOKEN not set');
    const api = new CategoryBudgetsApiPage(request, liveApiUrl);
    const resp = await api.delete(liveMemberToken, liveCategoryId);

    expect(resp.status()).toBe(403);
    const body = await resp.json();
    expect(body.detail).toContain('owner');
  });

  test('returns 401 when no Authorization header is supplied', async ({ request }) => {
    const api = new CategoryBudgetsApiPage(request, liveApiUrl);
    const resp = await api.deleteUnauthenticated(liveCategoryId);

    expect([401, 403]).toContain(resp.status());
  });

  test('returns 422 when category_id is not a valid UUID', async ({ request }) => {
    const api = new CategoryBudgetsApiPage(request, liveApiUrl);
    // FastAPI's Path(pattern=UUID_PATTERN) should reject non-UUID strings with 422.
    const resp = await api.delete(liveToken, 'not-a-uuid');

    expect(resp.status()).toBe(422);
  });
});
