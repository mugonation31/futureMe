/**
 * IncomeApiPage
 *
 * Page object for the income-stream CRUD backend endpoints (Task 23):
 *   POST   /api/budget/{budget_id}/income
 *   PATCH  /api/budget/{budget_id}/income/{income_id}
 *   DELETE /api/budget/{budget_id}/income/{income_id}
 *
 * Also wraps the two endpoints needed to set up an isolated test run:
 *   POST /api/auth/register          — mint a fresh user + JWT per test
 *   GET  /api/budget?scope=...        — read (auto-create) the caller's
 *                                       current-month budget and its id
 *
 * Wraps Playwright's APIRequestContext so that test specs never contain raw
 * URLs or JSON shape knowledge. Every mutation method exposes a `...Raw`
 * variant returning the untouched APIResponse so callers can assert on status
 * codes (201 / 204 / 404 / 422 / 401 / 403) directly.
 *
 * Port 8002 matches the Docker Compose backend mapping in playwright.config.ts.
 */

import { APIRequestContext, APIResponse } from '@playwright/test';

const BASE = 'http://localhost:8002/api';

// ---------------------------------------------------------------------------
// Response shape interfaces (mirror backend Pydantic models)
// ---------------------------------------------------------------------------

/** Mirrors IncomeStreamResponse in backend/models.py. */
export interface IncomeStreamResponse {
  id: string;
  budget_id: string;
  label: string;
  amount: number;
  position: number;
  created_at: string;
  updated_at: string;
}

/** Subset of BudgetResponse in backend/models.py that these tests care about. */
export interface BudgetResponse {
  id: string;
  scope: 'personal' | 'household';
  total_income: number;
  income_streams: IncomeStreamResponse[];
}

/** Access token + minimal user info returned by POST /api/auth/register. */
export interface RegisteredUser {
  token: string;
  email: string;
  userId: string;
}

export type BudgetScope = 'personal' | 'household';

// ---------------------------------------------------------------------------
// IncomeApiPage
// ---------------------------------------------------------------------------

export class IncomeApiPage {
  constructor(private readonly request: APIRequestContext) {}

  private authHeader(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  // ------------------------------------------------------------------
  // Test-setup helpers: fresh user + budget
  // ------------------------------------------------------------------

  /**
   * Register a brand-new user and return their JWT.
   *
   * Each call uses a unique email (timestamp + random suffix) so runs are
   * fully isolated and never collide with "email already registered" (409).
   */
  async registerUser(): Promise<RegisteredUser> {
    const unique = `${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    const email = `e2e.income.${unique}@futureme-test.example.com`;

    const res = await this.request.post(`${BASE}/auth/register`, {
      headers: { 'Content-Type': 'application/json' },
      data: {
        email,
        password: 'TestPassword1!',
        first_name: 'Income',
        last_name: 'Tester',
      },
    });

    if (res.status() !== 201) {
      const body = await res.text();
      throw new Error(`registerUser failed (${res.status()}): ${body}`);
    }

    const body = await res.json();
    return { token: body.access_token, email, userId: body.user.id };
  }

  /**
   * GET /api/budget — reads (and, on first access, auto-creates + seeds) the
   * caller's current-month budget for the given scope. Returns the raw response
   * so callers can assert on it if needed.
   *
   * `personal` scope is used by default because it needs no household, keeping
   * ownership-isolation tests simple (two personal budgets = two distinct owners).
   */
  async getBudgetRaw(token: string, scope: BudgetScope = 'personal'): Promise<APIResponse> {
    return this.request.get(`${BASE}/budget?scope=${scope}`, {
      headers: this.authHeader(token),
    });
  }

  /** Convenience wrapper — asserts 200 and returns the parsed BudgetResponse. */
  async getBudget(token: string, scope: BudgetScope = 'personal'): Promise<BudgetResponse> {
    const res = await this.getBudgetRaw(token, scope);
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`getBudget failed (${res.status()}): ${body}`);
    }
    return res.json() as Promise<BudgetResponse>;
  }

  /** Convenience — register a user and return both their token and budget id. */
  async newUserWithBudget(
    scope: BudgetScope = 'personal',
  ): Promise<{ user: RegisteredUser; budgetId: string }> {
    const user = await this.registerUser();
    const budget = await this.getBudget(user.token, scope);
    return { user, budgetId: budget.id };
  }

  // ------------------------------------------------------------------
  // POST /api/budget/{budget_id}/income
  // ------------------------------------------------------------------

  /** Raw call — full access to status code and body. */
  async createIncomeRaw(
    token: string,
    budgetId: string,
    payload: Record<string, unknown>,
  ): Promise<APIResponse> {
    return this.request.post(`${BASE}/budget/${budgetId}/income`, {
      headers: { ...this.authHeader(token), 'Content-Type': 'application/json' },
      data: payload,
    });
  }

  /** Convenience wrapper — asserts 201 and returns the parsed IncomeStreamResponse. */
  async createIncome(
    token: string,
    budgetId: string,
    payload: { label: string; amount: number },
  ): Promise<IncomeStreamResponse> {
    const res = await this.createIncomeRaw(token, budgetId, payload);
    if (res.status() !== 201) {
      const body = await res.text();
      throw new Error(`createIncome failed (${res.status()}): ${body}`);
    }
    return res.json() as Promise<IncomeStreamResponse>;
  }

  // ------------------------------------------------------------------
  // PATCH /api/budget/{budget_id}/income/{income_id}
  // ------------------------------------------------------------------

  /** Raw call — full access to status code and body. */
  async updateIncomeRaw(
    token: string,
    budgetId: string,
    incomeId: string,
    payload: Record<string, unknown>,
  ): Promise<APIResponse> {
    return this.request.patch(`${BASE}/budget/${budgetId}/income/${incomeId}`, {
      headers: { ...this.authHeader(token), 'Content-Type': 'application/json' },
      data: payload,
    });
  }

  /** Convenience wrapper — asserts 200 and returns the parsed IncomeStreamResponse. */
  async updateIncome(
    token: string,
    budgetId: string,
    incomeId: string,
    payload: Record<string, unknown>,
  ): Promise<IncomeStreamResponse> {
    const res = await this.updateIncomeRaw(token, budgetId, incomeId, payload);
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`updateIncome failed (${res.status()}): ${body}`);
    }
    return res.json() as Promise<IncomeStreamResponse>;
  }

  // ------------------------------------------------------------------
  // DELETE /api/budget/{budget_id}/income/{income_id}
  // ------------------------------------------------------------------

  /** Raw call — full access to the status code (expected 204 / 404). */
  async deleteIncomeRaw(
    token: string,
    budgetId: string,
    incomeId: string,
  ): Promise<APIResponse> {
    return this.request.delete(`${BASE}/budget/${budgetId}/income/${incomeId}`, {
      headers: this.authHeader(token),
    });
  }
}
