/**
 * DebtsApiPage
 *
 * Page object for the debt and savings-goal backend endpoints:
 *   GET    /api/debts
 *   POST   /api/debts
 *   PATCH  /api/debts/{id}
 *   DELETE /api/debts/{id}
 *   GET    /api/savings-goals
 *   POST   /api/savings-goals
 *   PATCH  /api/savings-goals/{id}
 *   DELETE /api/savings-goals/{id}
 *
 * Wraps Playwright's APIRequestContext so that test specs never
 * contain raw URLs or JSON shape knowledge.
 *
 * Port 8002 matches the Docker Compose backend mapping in playwright.config.ts.
 */

import { APIRequestContext, APIResponse } from '@playwright/test';

const BASE = 'http://localhost:8002/api';

// ---------------------------------------------------------------------------
// Response shape interfaces (mirrors backend Pydantic models)
// ---------------------------------------------------------------------------

export interface DebtResponse {
  id: string;
  household_id: string;
  user_id: string | null;
  name: string;
  /** Task 13: immutable opening balance set at creation time. */
  starting_balance: number;
  /** Task 13: derived value = GREATEST(0, starting_balance − SUM(confirmed payments)). */
  balance: number;
  interest_rate: number;
  minimum_payment: number;
  created_at: string;
  updated_at: string;
}

export interface DebtSummary {
  total_owed: number;
  total_minimum_payments: number;
  debt_count: number;
}

export interface DashboardStats {
  total_income: number;
  total_expenses: number;
  net_position: number;
  debt_summary: DebtSummary;
}

export interface SavingsGoalResponse {
  id: string;
  household_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// DebtsApiPage
// ---------------------------------------------------------------------------

export class DebtsApiPage {
  constructor(private readonly request: APIRequestContext) {}

  private authHeader(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  // ------------------------------------------------------------------
  // Debts
  // ------------------------------------------------------------------

  /** GET /api/debts — list all debts for the authenticated household. */
  async listDebtsRaw(token: string): Promise<APIResponse> {
    return this.request.get(`${BASE}/debts`, {
      headers: this.authHeader(token),
    });
  }

  /**
   * POST /api/debts — create a new debt.
   * Returns the raw APIResponse so callers can inspect status and body.
   */
  async createDebtRaw(
    token: string,
    payload: {
      name: string;
      balance: number;
      interest_rate?: number;
      minimum_payment?: number;
    },
  ): Promise<APIResponse> {
    return this.request.post(`${BASE}/debts`, {
      headers: { ...this.authHeader(token), 'Content-Type': 'application/json' },
      data: payload,
    });
  }

  /**
   * Convenience wrapper — asserts 201 and returns the parsed DebtResponse.
   * Throws with a descriptive error on non-2xx.
   */
  async createDebt(
    token: string,
    payload: {
      name: string;
      balance: number;
      interest_rate?: number;
      minimum_payment?: number;
    },
  ): Promise<DebtResponse> {
    const res = await this.createDebtRaw(token, payload);
    if (res.status() !== 201) {
      const body = await res.text();
      throw new Error(`createDebt failed (${res.status()}): ${body}`);
    }
    return res.json() as Promise<DebtResponse>;
  }

  /**
   * PATCH /api/debts/{id} — update an existing debt.
   * Returns the raw APIResponse so callers can assert on immutability.
   */
  async updateDebtRaw(
    token: string,
    debtId: string,
    payload: Record<string, unknown>,
  ): Promise<APIResponse> {
    return this.request.patch(`${BASE}/debts/${debtId}`, {
      headers: { ...this.authHeader(token), 'Content-Type': 'application/json' },
      data: payload,
    });
  }

  /**
   * Convenience wrapper — asserts 200 and returns the parsed DebtResponse.
   * Throws with a descriptive error on non-2xx.
   */
  async updateDebt(
    token: string,
    debtId: string,
    payload: Record<string, unknown>,
  ): Promise<DebtResponse> {
    const res = await this.updateDebtRaw(token, debtId, payload);
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`updateDebt failed (${res.status()}): ${body}`);
    }
    return res.json() as Promise<DebtResponse>;
  }

  /**
   * DELETE /api/debts/{id} — delete a debt.
   * Returns the raw APIResponse so callers can inspect the status code.
   */
  async deleteDebtRaw(token: string, debtId: string): Promise<APIResponse> {
    return this.request.delete(`${BASE}/debts/${debtId}`, {
      headers: this.authHeader(token),
    });
  }

  // ------------------------------------------------------------------
  // Dashboard
  // ------------------------------------------------------------------

  /**
   * GET /api/dashboard — returns the full dashboard stats including
   * debt_summary.total_owed which aggregates derived balances (Task 13).
   */
  async getDashboardRaw(token: string): Promise<APIResponse> {
    return this.request.get(`${BASE}/dashboard`, {
      headers: this.authHeader(token),
    });
  }

  /**
   * Convenience wrapper — asserts 200 and returns the parsed DashboardStats.
   */
  async getDashboard(token: string): Promise<DashboardStats> {
    const res = await this.getDashboardRaw(token);
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`getDashboard failed (${res.status()}): ${body}`);
    }
    return res.json() as Promise<DashboardStats>;
  }

  // ------------------------------------------------------------------
  // Savings Goals
  // ------------------------------------------------------------------

  /** GET /api/savings-goals — list all savings goals for the authenticated household. */
  async listSavingsGoalsRaw(token: string): Promise<APIResponse> {
    return this.request.get(`${BASE}/savings-goals`, {
      headers: this.authHeader(token),
    });
  }

  /**
   * POST /api/savings-goals — create a new savings goal.
   * Returns the raw APIResponse so callers can inspect status and body.
   */
  async createSavingsGoalRaw(
    token: string,
    payload: {
      name: string;
      target_amount: number;
      current_amount?: number;
      deadline?: string | null;
    },
  ): Promise<APIResponse> {
    return this.request.post(`${BASE}/savings-goals`, {
      headers: { ...this.authHeader(token), 'Content-Type': 'application/json' },
      data: payload,
    });
  }

  /**
   * Convenience wrapper — asserts 201 and returns the parsed SavingsGoalResponse.
   * Throws with a descriptive error on non-2xx.
   */
  async createSavingsGoal(
    token: string,
    payload: {
      name: string;
      target_amount: number;
      current_amount?: number;
      deadline?: string | null;
    },
  ): Promise<SavingsGoalResponse> {
    const res = await this.createSavingsGoalRaw(token, payload);
    if (res.status() !== 201) {
      const body = await res.text();
      throw new Error(`createSavingsGoal failed (${res.status()}): ${body}`);
    }
    return res.json() as Promise<SavingsGoalResponse>;
  }

  /**
   * PATCH /api/savings-goals/{id} — update a savings goal.
   * Returns the raw APIResponse so callers can assert on status codes.
   */
  async updateSavingsGoalRaw(
    token: string,
    goalId: string,
    payload: Record<string, unknown>,
  ): Promise<APIResponse> {
    return this.request.patch(`${BASE}/savings-goals/${goalId}`, {
      headers: { ...this.authHeader(token), 'Content-Type': 'application/json' },
      data: payload,
    });
  }

  /**
   * Convenience wrapper — asserts 200 and returns the parsed SavingsGoalResponse.
   * Throws with a descriptive error on non-2xx.
   */
  async updateSavingsGoal(
    token: string,
    goalId: string,
    payload: Record<string, unknown>,
  ): Promise<SavingsGoalResponse> {
    const res = await this.updateSavingsGoalRaw(token, goalId, payload);
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`updateSavingsGoal failed (${res.status()}): ${body}`);
    }
    return res.json() as Promise<SavingsGoalResponse>;
  }

  /**
   * DELETE /api/savings-goals/{id} — delete a savings goal.
   * Returns the raw APIResponse so callers can inspect the status code.
   */
  async deleteSavingsGoalRaw(token: string, goalId: string): Promise<APIResponse> {
    return this.request.delete(`${BASE}/savings-goals/${goalId}`, {
      headers: this.authHeader(token),
    });
  }
}
