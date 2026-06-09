/**
 * CorsApiPage
 *
 * Page object for SEC-4 CORS tightening E2E tests.
 *
 * Playwright's APIRequestContext omits the `Origin` header on direct requests
 * because the built-in HTTP client does not treat it as a cross-origin browser
 * request.  Instead, this page object uses Node's built-in `fetch` (Node >= 18)
 * so tests have complete control over every request header, including `Origin`,
 * `Access-Control-Request-Method`, and `Access-Control-Request-Headers`.
 *
 * Method naming conventions match the rest of the page objects in this project:
 *   - *Raw methods return the full Response so specs can assert on any header.
 */

const BACKEND = 'http://localhost:8002';

// ---------------------------------------------------------------------------
// PreflightResponse — a minimal parsed envelope around a CORS preflight reply
// ---------------------------------------------------------------------------

export interface PreflightResult {
  status: number;
  allowOrigin: string | null;
  allowMethods: string | null;
  allowHeaders: string | null;
  vary: string | null;
}

// ---------------------------------------------------------------------------
// SimpleRequestResult — for non-preflight cross-origin GET / POST responses
// ---------------------------------------------------------------------------

export interface SimpleRequestResult {
  status: number;
  ok: boolean;
  allowOrigin: string | null;
  body: unknown;
}

// ---------------------------------------------------------------------------
// CorsApiPage
// ---------------------------------------------------------------------------

export class CorsApiPage {
  /**
   * Send an OPTIONS preflight to `path` simulating a cross-origin browser request.
   *
   * @param path                  - URL path (e.g. "/health", "/api/transactions")
   * @param origin                - Value for the `Origin` header
   * @param requestMethod         - Value for `Access-Control-Request-Method`
   * @param requestHeaders        - Optional value for `Access-Control-Request-Headers`
   */
  async preflight(
    path: string,
    origin: string,
    requestMethod: string,
    requestHeaders?: string,
  ): Promise<PreflightResult> {
    const headers: Record<string, string> = {
      Origin: origin,
      'Access-Control-Request-Method': requestMethod,
    };
    if (requestHeaders) {
      headers['Access-Control-Request-Headers'] = requestHeaders;
    }

    const res = await fetch(`${BACKEND}${path}`, {
      method: 'OPTIONS',
      headers,
    });

    return {
      status: res.status,
      allowOrigin: res.headers.get('access-control-allow-origin'),
      allowMethods: res.headers.get('access-control-allow-methods'),
      allowHeaders: res.headers.get('access-control-allow-headers'),
      vary: res.headers.get('vary'),
    };
  }

  /**
   * Send a simple cross-origin GET with an `Origin` header.
   * This represents a simple CORS request (no preflight) from the browser.
   *
   * @param path    - URL path (e.g. "/health")
   * @param origin  - Value for the `Origin` header
   * @param token   - Optional Bearer token for Authorization
   */
  async simpleGet(
    path: string,
    origin: string,
    token?: string,
  ): Promise<SimpleRequestResult> {
    const headers: Record<string, string> = { Origin: origin };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${BACKEND}${path}`, {
      method: 'GET',
      headers,
    });

    let body: unknown;
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      body = await res.json();
    } else {
      body = await res.text();
    }

    return {
      status: res.status,
      ok: res.ok,
      allowOrigin: res.headers.get('access-control-allow-origin'),
      body,
    };
  }

  /**
   * Send a cross-origin POST with an `Origin` header.
   * Used to test that POST /api/auth/login still functions for a listed origin.
   *
   * @param path    - URL path (e.g. "/api/auth/login")
   * @param origin  - Value for the `Origin` header
   * @param data    - JSON-serialisable request body
   */
  async simplePost(
    path: string,
    origin: string,
    data: Record<string, unknown>,
  ): Promise<SimpleRequestResult> {
    const res = await fetch(`${BACKEND}${path}`, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    let body: unknown;
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      body = await res.json();
    } else {
      body = await res.text();
    }

    return {
      status: res.status,
      ok: res.ok,
      allowOrigin: res.headers.get('access-control-allow-origin'),
      body,
    };
  }

  /**
   * Register a new user — used in regression tests that need a valid JWT.
   * Calls POST /api/auth/register with no Origin header (server-side call).
   *
   * Returns the access_token string, or throws on non-2xx.
   */
  async registerAndGetToken(email: string, password: string, name: string): Promise<string> {
    const res = await fetch(`${BACKEND}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`register failed ${res.status}: ${text}`);
    }

    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  }
}
