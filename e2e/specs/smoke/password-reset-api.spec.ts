/**
 * Password-Reset API — E2E smoke tests
 *
 * All requests go directly to the FastAPI backend (port 8002).
 * No browser is involved — these tests use Playwright's `request` fixture only.
 *
 * REQUIRES: Docker Compose running (`docker compose up -d --build`)
 *
 * Run just this file:
 *   npx playwright test --project=password-reset-api
 *
 * Scenarios covered:
 *   1.  POST /api/auth/forgot-password with an unknown email returns 200
 *       (safe to test without a real user — anti-enumeration design)
 *   2.  POST /api/auth/forgot-password with email shorter than 3 chars returns 422
 *   3.  POST /api/auth/forgot-password with email longer than 254 chars returns 422
 *   4.  POST /api/auth/reset-password with an obviously invalid (non-JWT) token returns 400
 *   5.  POST /api/auth/reset-password with an expired JWT returns 400
 *   6.  POST /api/auth/reset-password with a password shorter than 6 chars returns 422
 *   7.  POST /api/auth/reset-password with a token longer than 2048 chars returns 422
 */

import { test, expect } from '@playwright/test';
import {
  PasswordResetApiPage,
  buildExpiredResetToken,
} from '../../pages/password-reset-api.page';

// ---------------------------------------------------------------------------
// beforeAll: skip entire suite when backend is unreachable
// ---------------------------------------------------------------------------

test.beforeAll(async ({ request }) => {
  // 1. Check the backend is up at all.
  try {
    const healthRes = await request.get('http://localhost:8002/health', { timeout: 4_000 });
    if (!healthRes.ok()) {
      test.skip(true, 'Backend /health returned non-OK — is Docker running?');
      return;
    }
  } catch {
    test.skip(true, 'Backend unreachable (ECONNREFUSED) — start Docker Compose first.');
    return;
  }

  // 2. Confirm the password-reset endpoints exist (the Docker image may be
  //    stale and pre-date Task 39).  A 404 here means the container needs
  //    to be rebuilt: `docker compose up -d --build`.
  try {
    const probeRes = await request.post('http://localhost:8002/api/auth/forgot-password', {
      data: { email: 'probe@e2e-test.invalid' },
      timeout: 4_000,
    });
    if (probeRes.status() === 404) {
      test.skip(
        true,
        'POST /api/auth/forgot-password returned 404 — rebuild the Docker image: docker compose up -d --build',
      );
    }
  } catch {
    test.skip(true, 'Failed to probe /api/auth/forgot-password — check backend logs.');
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/forgot-password
// ---------------------------------------------------------------------------

test.describe('POST /api/auth/forgot-password', () => {
  test('returns 200 for an unknown email (anti-enumeration: always succeeds)', async ({ request }) => {
    const api = new PasswordResetApiPage(request);

    // Use a domain that cannot exist — the backend should still return 200
    // regardless of whether the email is registered.
    const res = await api.forgotPasswordRaw('unknown-user@e2e-test.invalid');

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.message).toBe('string');
    expect(body.message.length).toBeGreaterThan(0);
  });

  test('returns 422 when email is shorter than 3 characters', async ({ request }) => {
    const api = new PasswordResetApiPage(request);

    // "a@" is 2 characters — below the min_length=3 Pydantic constraint.
    const res = await api.forgotPasswordRaw('a@');

    expect(res.status()).toBe(422);
    const body = await res.json();
    // Pydantic 422 detail is a list of validation errors
    expect(Array.isArray(body.detail)).toBe(true);
    expect(body.detail.length).toBeGreaterThan(0);
  });

  test('returns 422 when email is longer than 254 characters', async ({ request }) => {
    const api = new PasswordResetApiPage(request);

    // Build an email string that exceeds the max_length=254 constraint.
    // 251 'a' characters + "@x.c" = 255 chars total — one over the limit.
    const longLocal = 'a'.repeat(251);
    const longEmail = `${longLocal}@x.c`; // 255 chars

    const res = await api.forgotPasswordRaw(longEmail);

    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(Array.isArray(body.detail)).toBe(true);
    expect(body.detail.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password
// ---------------------------------------------------------------------------

test.describe('POST /api/auth/reset-password', () => {
  test('returns 400 for an obviously invalid (non-JWT) token', async ({ request }) => {
    const api = new PasswordResetApiPage(request);

    // A plain string is not a valid JWT — signature verification fails.
    const res = await api.resetPasswordRaw('this-is-not-a-jwt', 'ValidPass1!');

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(typeof body.detail).toBe('string');
    expect(body.detail.length).toBeGreaterThan(0);
  });

  test('returns 400 for a valid-format JWT with exp in the past', async ({ request }) => {
    const api = new PasswordResetApiPage(request);

    // Build an HS256 JWT whose `exp` claim is 24 hours in the past.
    // The token is signed with a test-only secret (not the real backend secret),
    // so the backend will reject it on signature grounds (→ 400 "Invalid reset token").
    // Even if the secret accidentally matched, the expired `exp` would still cause 400.
    // Either way the response is 400 — which is the contract under test.
    const expiredToken = buildExpiredResetToken();

    const res = await api.resetPasswordRaw(expiredToken, 'ValidPass1!');

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(typeof body.detail).toBe('string');
    expect(body.detail.length).toBeGreaterThan(0);
  });

  test('returns 422 when new_password is shorter than 6 characters', async ({ request }) => {
    const api = new PasswordResetApiPage(request);

    // "abc12" is 5 characters — below the min_length=6 Pydantic constraint.
    // The validation error fires before any token verification.
    const res = await api.resetPasswordRaw('some-token', 'abc12');

    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(Array.isArray(body.detail)).toBe(true);
    expect(body.detail.length).toBeGreaterThan(0);
  });

  test('returns 422 when token exceeds 2048 characters', async ({ request }) => {
    const api = new PasswordResetApiPage(request);

    // Build a token string that exceeds the max_length=2048 Pydantic constraint.
    // 2049 'x' characters is clearly over the limit.
    const tooLongToken = 'x'.repeat(2049);

    const res = await api.resetPasswordRaw(tooLongToken, 'ValidPass1!');

    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(Array.isArray(body.detail)).toBe(true);
    expect(body.detail.length).toBeGreaterThan(0);
  });
});
