/**
 * TransactionsApiPage
 *
 * Page object for all transaction and category API interactions.
 * Wraps the Playwright `APIRequestContext` so that test specs never
 * contain raw URLs, header construction, or JSON shape knowledge.
 *
 * Usage in tests:
 *   const api = new TransactionsApiPage(request);
 *   const { token } = await api.register(email, password, name);
 */

import { APIRequestContext, APIResponse } from '@playwright/test';

const BASE = 'http://localhost:8002/api';

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ---------------------------------------------------------------------------
// Response shape interfaces (mirrors backend Pydantic models)
// ---------------------------------------------------------------------------

export interface AuthPayload {
  access_token: string;
  user: { id: string; email: string; display_name: string | null };
}

export interface HouseholdPayload {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
  created_by: string;
}

export interface CategoryPayload {
  id: string;
  household_id: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  is_default: boolean;
  created_at: string;
}

export interface TransactionPayload {
  id: string;
  household_id: string;
  user_id: string;
  category_id: string | null;
  category_name: string | null;
  amount: number;
  type: 'expense' | 'income';
  description: string | null;
  date: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// TransactionsApiPage
// ---------------------------------------------------------------------------

export class TransactionsApiPage {
  constructor(private readonly request: APIRequestContext) {}

  // ------------------------------------------------------------------
  // Auth
  // ------------------------------------------------------------------

  /** POST /api/auth/register — returns raw response for flexible assertions. */
  async registerRaw(email: string, password: string, name: string): Promise<APIResponse> {
    return this.request.post(`${BASE}/auth/register`, {
      data: { email, password, name },
    });
  }

  /**
   * Register and return the parsed AuthPayload.
   * Throws if registration fails (non-2xx).
   */
  async register(email: string, password: string, name: string): Promise<AuthPayload> {
    const res = await this.registerRaw(email, password, name);
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`register failed ${res.status()}: ${body}`);
    }
    return res.json() as Promise<AuthPayload>;
  }

  /** POST /api/auth/login — returns raw response. */
  async loginRaw(email: string, password: string): Promise<APIResponse> {
    return this.request.post(`${BASE}/auth/login`, {
      data: { email, password },
    });
  }

  /** Login and return the parsed AuthPayload. */
  async login(email: string, password: string): Promise<AuthPayload> {
    const res = await this.loginRaw(email, password);
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`login failed ${res.status()}: ${body}`);
    }
    return res.json() as Promise<AuthPayload>;
  }

  // ------------------------------------------------------------------
  // Households
  // ------------------------------------------------------------------

  /** POST /api/households — returns raw response. */
  async createHouseholdRaw(token: string, name: string): Promise<APIResponse> {
    return this.request.post(`${BASE}/households`, {
      headers: authHeaders(token),
      data: { name },
    });
  }

  /** Create household and return the parsed HouseholdPayload. */
  async createHousehold(token: string, name: string): Promise<HouseholdPayload> {
    const res = await this.createHouseholdRaw(token, name);
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`createHousehold failed ${res.status()}: ${body}`);
    }
    return res.json() as Promise<HouseholdPayload>;
  }

  /** POST /api/households/join — returns raw response. */
  async joinHouseholdRaw(token: string, inviteCode: string): Promise<APIResponse> {
    return this.request.post(`${BASE}/households/join`, {
      headers: authHeaders(token),
      data: { invite_code: inviteCode },
    });
  }

  // ------------------------------------------------------------------
  // Categories
  // ------------------------------------------------------------------

  /** GET /api/categories — returns raw response. */
  async getCategoriesRaw(token: string): Promise<APIResponse> {
    return this.request.get(`${BASE}/categories`, {
      headers: authHeaders(token),
    });
  }

  /** GET /api/categories — returns parsed list. */
  async getCategories(token: string): Promise<CategoryPayload[]> {
    const res = await this.getCategoriesRaw(token);
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`getCategories failed ${res.status()}: ${body}`);
    }
    return res.json() as Promise<CategoryPayload[]>;
  }

  /** POST /api/categories — returns raw response. */
  async createCategoryRaw(
    token: string,
    name: string,
    icon?: string,
    color?: string,
  ): Promise<APIResponse> {
    return this.request.post(`${BASE}/categories`, {
      headers: authHeaders(token),
      data: { name, icon: icon ?? null, color: color ?? null },
    });
  }

  /** Create a custom category and return the parsed CategoryPayload. */
  async createCategory(
    token: string,
    name: string,
    icon?: string,
    color?: string,
  ): Promise<CategoryPayload> {
    const res = await this.createCategoryRaw(token, name, icon, color);
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`createCategory failed ${res.status()}: ${body}`);
    }
    return res.json() as Promise<CategoryPayload>;
  }

  // ------------------------------------------------------------------
  // Transactions
  // ------------------------------------------------------------------

  /** GET /api/transactions — optional ?month=YYYY-MM filter. Returns raw response. */
  async getTransactionsRaw(token: string, month?: string): Promise<APIResponse> {
    const url = month ? `${BASE}/transactions?month=${month}` : `${BASE}/transactions`;
    return this.request.get(url, { headers: authHeaders(token) });
  }

  /** GET /api/transactions — returns parsed list. */
  async getTransactions(token: string, month?: string): Promise<TransactionPayload[]> {
    const res = await this.getTransactionsRaw(token, month);
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`getTransactions failed ${res.status()}: ${body}`);
    }
    return res.json() as Promise<TransactionPayload[]>;
  }

  /** POST /api/transactions — returns raw response. */
  async createTransactionRaw(
    token: string,
    data: {
      amount: number;
      type: 'expense' | 'income';
      description?: string;
      date?: string;
      category_id?: string;
    },
  ): Promise<APIResponse> {
    return this.request.post(`${BASE}/transactions`, {
      headers: authHeaders(token),
      data,
    });
  }

  /** Create a transaction and return the parsed TransactionPayload. */
  async createTransaction(
    token: string,
    data: {
      amount: number;
      type: 'expense' | 'income';
      description?: string;
      date?: string;
      category_id?: string;
    },
  ): Promise<TransactionPayload> {
    const res = await this.createTransactionRaw(token, data);
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`createTransaction failed ${res.status()}: ${body}`);
    }
    return res.json() as Promise<TransactionPayload>;
  }

  /** GET /api/transactions/{id} — returns raw response. */
  async getTransactionRaw(token: string, id: string): Promise<APIResponse> {
    return this.request.get(`${BASE}/transactions/${id}`, {
      headers: authHeaders(token),
    });
  }

  /** GET /api/transactions/{id} — returns parsed payload. */
  async getTransaction(token: string, id: string): Promise<TransactionPayload> {
    const res = await this.getTransactionRaw(token, id);
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`getTransaction failed ${res.status()}: ${body}`);
    }
    return res.json() as Promise<TransactionPayload>;
  }

  /** PATCH /api/transactions/{id} — returns raw response. */
  async updateTransactionRaw(
    token: string,
    id: string,
    data: Partial<{
      amount: number;
      type: 'expense' | 'income';
      description: string;
      date: string;
      category_id: string;
    }>,
  ): Promise<APIResponse> {
    return this.request.patch(`${BASE}/transactions/${id}`, {
      headers: authHeaders(token),
      data,
    });
  }

  /** PATCH /api/transactions/{id} — returns parsed payload. */
  async updateTransaction(
    token: string,
    id: string,
    data: Partial<{
      amount: number;
      type: 'expense' | 'income';
      description: string;
      date: string;
      category_id: string;
    }>,
  ): Promise<TransactionPayload> {
    const res = await this.updateTransactionRaw(token, id, data);
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`updateTransaction failed ${res.status()}: ${body}`);
    }
    return res.json() as Promise<TransactionPayload>;
  }

  /** DELETE /api/transactions/{id} — returns raw response. */
  async deleteTransactionRaw(token: string, id: string): Promise<APIResponse> {
    return this.request.delete(`${BASE}/transactions/${id}`, {
      headers: authHeaders(token),
    });
  }
}
