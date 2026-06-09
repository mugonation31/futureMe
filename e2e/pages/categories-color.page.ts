/**
 * CategoriesColorPage
 *
 * Page object for SEC-3 hex colour validation tests against POST /api/categories.
 * Wraps the Playwright `APIRequestContext` so that specs never contain raw URLs,
 * header construction, or JSON shape knowledge.
 *
 * Extends the shape established by TransactionsApiPage — reusing the same
 * auth/household bootstrap helpers to avoid duplicating setup logic.
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

// ---------------------------------------------------------------------------
// CategoriesColorPage
// ---------------------------------------------------------------------------

export class CategoriesColorPage {
  constructor(private readonly request: APIRequestContext) {}

  // ------------------------------------------------------------------
  // Auth
  // ------------------------------------------------------------------

  /** POST /api/auth/register — throws on failure, returns parsed payload. */
  async register(email: string, password: string, name: string): Promise<AuthPayload> {
    const res = await this.request.post(`${BASE}/auth/register`, {
      data: { email, password, name },
    });
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`register failed ${res.status()}: ${body}`);
    }
    return res.json() as Promise<AuthPayload>;
  }

  // ------------------------------------------------------------------
  // Households
  // ------------------------------------------------------------------

  /** POST /api/households — throws on failure, returns parsed payload. */
  async createHousehold(token: string, name: string): Promise<HouseholdPayload> {
    const res = await this.request.post(`${BASE}/households`, {
      headers: authHeaders(token),
      data: { name },
    });
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`createHousehold failed ${res.status()}: ${body}`);
    }
    return res.json() as Promise<HouseholdPayload>;
  }

  // ------------------------------------------------------------------
  // Categories — raw (for assertions on status + body)
  // ------------------------------------------------------------------

  /**
   * POST /api/categories — returns the raw APIResponse so that specs can assert
   * on any status code (200, 201, 422, etc.) without the helper throwing.
   */
  async createCategoryRaw(
    token: string,
    payload: { name: string; icon?: string | null; color?: string | null },
  ): Promise<APIResponse> {
    return this.request.post(`${BASE}/categories`, {
      headers: authHeaders(token),
      data: {
        name: payload.name,
        icon: payload.icon ?? null,
        color: payload.color ?? null,
      },
    });
  }

  /**
   * POST /api/categories — throws on failure, returns parsed CategoryPayload.
   * Used for success-path assertions.
   */
  async createCategory(
    token: string,
    payload: { name: string; icon?: string | null; color?: string | null },
  ): Promise<CategoryPayload> {
    const res = await this.createCategoryRaw(token, payload);
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`createCategory failed ${res.status()}: ${body}`);
    }
    return res.json() as Promise<CategoryPayload>;
  }

  // ------------------------------------------------------------------
  // Categories — list
  // ------------------------------------------------------------------

  /** GET /api/categories — returns parsed list. */
  async getCategories(token: string): Promise<CategoryPayload[]> {
    const res = await this.request.get(`${BASE}/categories`, {
      headers: authHeaders(token),
    });
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`getCategories failed ${res.status()}: ${body}`);
    }
    return res.json() as Promise<CategoryPayload[]>;
  }
}
