/**
 * PasswordResetApiPage
 *
 * Page object for the password-reset backend endpoints:
 *   POST /api/auth/forgot-password
 *   POST /api/auth/reset-password
 *
 * Wraps the Playwright `APIRequestContext` so that test specs never
 * contain raw URLs or JSON shape knowledge.
 *
 * No authentication header is required for either endpoint.
 */

import { APIRequestContext, APIResponse } from '@playwright/test';

// Port 8002 matches the Docker Compose backend mapping in playwright.config.ts.
// For a local dev server use port 8000 (uvicorn main:app --port 8000).
const BASE = 'http://localhost:8002/api';

// ---------------------------------------------------------------------------
// Response shape interfaces (mirrors backend Pydantic models)
// ---------------------------------------------------------------------------

export interface MessagePayload {
  message: string;
}

// ---------------------------------------------------------------------------
// JWT construction helpers (no external package required)
// ---------------------------------------------------------------------------

/**
 * Encode a value as base64url (URL-safe, no padding).
 * Used to build test JWTs without pulling in `jsonwebtoken`.
 */
function base64url(value: string): string {
  // btoa is not available in Node.js < 16; use Buffer instead.
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Build a minimal HS256 JWT signed with a caller-supplied secret.
 *
 * The signature is computed with Node's built-in `crypto` module.
 * This keeps the helper self-contained and avoids any npm dependency.
 *
 * @param payload  - JWT claims object.
 * @param secret   - HMAC-SHA256 signing secret (string).
 */
export function buildJwt(payload: Record<string, unknown>, secret: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto') as typeof import('crypto');

  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body   = base64url(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${signingInput}.${signature}`;
}

/**
 * Build an expired password-reset JWT (exp in the past).
 * Uses a test-only secret that is intentionally different from the backend's
 * real secret, so the token is also invalid on signature grounds — both
 * conditions independently produce a 400 from the backend.
 *
 * Passing `useBackendSecret: true` requires the caller to supply the real
 * secret; callers that only need the 400 response can omit it.
 */
export function buildExpiredResetToken(secret = 'e2e-test-secret-not-real'): string {
  const oneDayAgo = Math.floor(Date.now() / 1000) - 86_400;
  return buildJwt(
    {
      sub: '00000000-0000-0000-0000-000000000001',
      purpose: 'password_reset',
      exp: oneDayAgo,
    },
    secret,
  );
}

// ---------------------------------------------------------------------------
// PasswordResetApiPage
// ---------------------------------------------------------------------------

export class PasswordResetApiPage {
  constructor(private readonly request: APIRequestContext) {}

  // ------------------------------------------------------------------
  // POST /api/auth/forgot-password
  // ------------------------------------------------------------------

  /** Raw call — gives callers full access to status code and body. */
  async forgotPasswordRaw(email: string): Promise<APIResponse> {
    return this.request.post(`${BASE}/auth/forgot-password`, {
      data: { email },
    });
  }

  /**
   * Convenience wrapper — asserts 200 and returns the parsed message payload.
   * Throws with a descriptive error on non-2xx.
   */
  async forgotPassword(email: string): Promise<MessagePayload> {
    const res = await this.forgotPasswordRaw(email);
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`forgotPassword failed ${res.status()}: ${body}`);
    }
    return res.json() as Promise<MessagePayload>;
  }

  // ------------------------------------------------------------------
  // POST /api/auth/reset-password
  // ------------------------------------------------------------------

  /** Raw call — gives callers full access to status code and body. */
  async resetPasswordRaw(token: string, newPassword: string): Promise<APIResponse> {
    return this.request.post(`${BASE}/auth/reset-password`, {
      data: { token, new_password: newPassword },
    });
  }

  /**
   * Convenience wrapper — asserts 200 and returns the parsed message payload.
   * Throws with a descriptive error on non-2xx.
   */
  async resetPassword(token: string, newPassword: string): Promise<MessagePayload> {
    const res = await this.resetPasswordRaw(token, newPassword);
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`resetPassword failed ${res.status()}: ${body}`);
    }
    return res.json() as Promise<MessagePayload>;
  }
}
