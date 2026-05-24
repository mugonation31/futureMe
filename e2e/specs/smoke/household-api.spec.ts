/**
 * Household API smoke tests — direct HTTP against the backend (port 8002).
 *
 * REQUIRES: Docker Compose running (`docker compose up -d --build`)
 * REQUIRES: Environment variables with pre-issued JWT tokens:
 *   TEST_OWNER_TOKEN   — JWT for a user who owns a household
 *   TEST_MEMBER_TOKEN  — JWT for a user who is a member (not owner) of that household
 *   TEST_NO_HOUSEHOLD_TOKEN — JWT for a user with no household
 *
 * Covers:
 *   7. Owner GET /api/households/invite-code → 200 with invite_code
 *   8. Member GET /api/households/invite-code → 403
 *   + Bonus: member GET /api/households/me → 200 without invite_code
 *   + Bonus: unauthenticated request → 403/401
 */

import { test, expect, request as playwrightRequest } from '@playwright/test';
import { testTokens } from '../../fixtures/users';

const API = 'http://localhost:8002/api';

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Skip all API tests when the backend is unreachable (Docker not running). */
test.beforeAll(async () => {
  try {
    const ctx = await playwrightRequest.newContext();
    const res = await ctx.get('http://localhost:8002/health', { timeout: 3_000 });
    await ctx.dispose();
    if (!res.ok()) test.skip(true, 'Backend /health returned non-OK — is Docker running?');
  } catch {
    test.skip(true, 'Backend unreachable (ECONNREFUSED) — start Docker Compose first.');
  }
});

test.describe('GET /api/households/invite-code', () => {
  test('owner receives 200 with invite_code in response', async ({ request }) => {
    test.skip(!testTokens.owner, 'TEST_OWNER_TOKEN not set — skipping API test');

    const response = await request.get(`${API}/households/invite-code`, {
      headers: authHeaders(testTokens.owner),
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('invite_code');
    expect(typeof body.invite_code).toBe('string');
    expect(body.invite_code.length).toBeGreaterThanOrEqual(6);
  });

  test('member receives 403 Forbidden', async ({ request }) => {
    test.skip(!testTokens.member, 'TEST_MEMBER_TOKEN not set — skipping API test');

    const response = await request.get(`${API}/households/invite-code`, {
      headers: authHeaders(testTokens.member),
    });

    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.detail).toMatch(/owner/i);
  });

  test('unauthenticated request receives 403', async ({ request }) => {
    const response = await request.get(`${API}/households/invite-code`);
    // HTTPBearer returns 403 when no credentials are provided
    expect([401, 403]).toContain(response.status());
  });
});

test.describe('GET /api/households/me', () => {
  test('returns household without invite_code for any member', async ({ request }) => {
    test.skip(!testTokens.member, 'TEST_MEMBER_TOKEN not set — skipping API test');

    const response = await request.get(`${API}/households/me`, {
      headers: authHeaders(testTokens.member),
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('name');
    // invite_code must NOT be present on the public endpoint
    expect(body).not.toHaveProperty('invite_code');
  });

  test('returns 404 for user with no household', async ({ request }) => {
    test.skip(!testTokens.noHousehold, 'TEST_NO_HOUSEHOLD_TOKEN not set — skipping API test');

    const response = await request.get(`${API}/households/me`, {
      headers: authHeaders(testTokens.noHousehold),
    });

    expect(response.status()).toBe(404);
  });
});

test.describe('POST /api/households/join — input validation', () => {
  test('rejects invite_code shorter than 6 characters with 422', async ({ request }) => {
    test.skip(!testTokens.noHousehold, 'TEST_NO_HOUSEHOLD_TOKEN not set — skipping API test');

    const response = await request.post(`${API}/households/join`, {
      headers: { ...authHeaders(testTokens.noHousehold), 'Content-Type': 'application/json' },
      data: { invite_code: 'AB' },
    });

    expect(response.status()).toBe(422);
  });

  test('rejects blank household name on create with 422', async ({ request }) => {
    test.skip(!testTokens.noHousehold, 'TEST_NO_HOUSEHOLD_TOKEN not set — skipping API test');

    const response = await request.post(`${API}/households`, {
      headers: { ...authHeaders(testTokens.noHousehold), 'Content-Type': 'application/json' },
      data: { name: '' },
    });

    expect(response.status()).toBe(422);
  });
});
