import { APIRequestContext, APIResponse } from '@playwright/test';

/**
 * CategoryBudgetsApiPage encapsulates all direct API interactions for the
 * /api/category-budgets endpoints.
 *
 * Since the frontend UI for category budgets is not yet built (Task 33),
 * this "page object" operates against the HTTP API directly via Playwright's
 * APIRequestContext rather than driving a browser UI.  This keeps selectors
 * out of specs while respecting the Page Object Model pattern.
 *
 * Endpoints covered
 * -----------------
 *  GET    /api/category-budgets              — list budgets for the household
 *  PUT    /api/category-budgets              — upsert a monthly limit (owner only)
 *  DELETE /api/category-budgets/{categoryId} — remove a budget (owner only, 204)
 *
 * Auth
 * ----
 * A Bearer token (JWT) must be supplied to every method.  In tests that drive
 * a live backend use a real token from loginAs().  In tests that only need to
 * verify Angular-side routing behaviour inject a fake token via seedAuthToken().
 */
export class CategoryBudgetsApiPage {
  constructor(private request: APIRequestContext, private apiUrl: string) {}

  /**
   * GET /api/category-budgets
   * Returns the raw Playwright APIResponse so callers can assert status and body.
   */
  async list(token: string): Promise<APIResponse> {
    return this.request.get(`${this.apiUrl}/category-budgets`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  /**
   * GET /api/category-budgets — called without any Authorization header.
   * Expected to return 401 or 403 depending on backend guard order.
   */
  async listUnauthenticated(): Promise<APIResponse> {
    return this.request.get(`${this.apiUrl}/category-budgets`);
  }

  /**
   * PUT /api/category-budgets
   * Upserts a monthly limit for the given category.
   */
  async upsert(
    token: string,
    body: { category_id: string; monthly_limit: number }
  ): Promise<APIResponse> {
    return this.request.put(`${this.apiUrl}/category-budgets`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: body,
    });
  }

  /**
   * PUT /api/category-budgets — called without any Authorization header.
   */
  async upsertUnauthenticated(body: {
    category_id: string;
    monthly_limit: number;
  }): Promise<APIResponse> {
    return this.request.put(`${this.apiUrl}/category-budgets`, {
      headers: { 'Content-Type': 'application/json' },
      data: body,
    });
  }

  /**
   * DELETE /api/category-budgets/{categoryId}
   * Removes the monthly limit for the given category.
   */
  async delete(token: string, categoryId: string): Promise<APIResponse> {
    return this.request.delete(
      `${this.apiUrl}/category-budgets/${categoryId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  }

  /**
   * DELETE /api/category-budgets/{categoryId} — called without any Authorization header.
   */
  async deleteUnauthenticated(categoryId: string): Promise<APIResponse> {
    return this.request.delete(
      `${this.apiUrl}/category-budgets/${categoryId}`
    );
  }
}
