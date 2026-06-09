/**
 * SEC-3: Category hex colour validation — API smoke tests
 *
 * All requests go directly to the FastAPI backend (port 8002).
 * No browser is involved — these tests use Playwright's `request` fixture only.
 *
 * REQUIRES: Docker Compose running (`docker compose up -d --build`)
 *
 * Run just this file:
 *   npx playwright test --project=categories-color-api
 *
 * What is tested:
 *   1. POST /api/categories with an invalid color (e.g. "red") returns 422 and
 *      a descriptive error message referencing hex format.
 *   2. POST /api/categories with a valid 6-digit hex color (e.g. "#FF5733")
 *      returns 201 and the category appears in GET /api/categories.
 *   3. POST /api/categories with color omitted (null / not supplied) succeeds —
 *      color is an optional field.
 *
 * Additional edge cases:
 *   4. Short hex (#FFF — 3 digits) is rejected with 422.
 *   5. Hex without leading hash (FF5733) is rejected with 422.
 *   6. Lowercase valid hex (#ff5733) is accepted.
 *   7. color field exceeding max_length=7 (e.g. "#FF5733extra") is rejected.
 */

import { test, expect } from '@playwright/test';
import { CategoriesColorPage } from '../../pages/categories-color.page';

// ---------------------------------------------------------------------------
// Unique-per-run email helpers (avoids "already registered" collisions)
// ---------------------------------------------------------------------------

const NOW = Date.now();

function uniqueEmail(label: string): string {
  return `e2e.sec3.${label}.${NOW}@futureme-test.example.com`;
}

const USER_EMAIL = uniqueEmail('color');
const USER_PASSWORD = 'TestPassword1!';
const USER_NAME = 'SEC3 Color Tester';

// ---------------------------------------------------------------------------
// Module-level shared state
// (Sequential execution within this file is guaranteed by workers=1)
// ---------------------------------------------------------------------------

let token = '';
let validCategoryId = '';

// ---------------------------------------------------------------------------
// beforeAll: skip entire suite when backend is unreachable
// ---------------------------------------------------------------------------

test.beforeAll(async ({ request }) => {
  try {
    const res = await request.get('http://localhost:8002/health', { timeout: 4_000 });
    if (!res.ok()) {
      test.skip(true, 'Backend /health returned non-OK — is Docker running?');
    }
  } catch {
    test.skip(true, 'Backend unreachable (ECONNREFUSED) — start Docker Compose first.');
  }
});

// ---------------------------------------------------------------------------
// Setup: register user + create household so /api/categories is accessible
// ---------------------------------------------------------------------------

test.describe('Setup — register user and create household', () => {
  test('registers a new user for SEC-3 color tests', async ({ request }) => {
    const api = new CategoriesColorPage(request);
    const auth = await api.register(USER_EMAIL, USER_PASSWORD, USER_NAME);

    expect(auth.access_token).toBeTruthy();
    expect(auth.user.email).toBe(USER_EMAIL);

    token = auth.access_token;
  });

  test('creates a household so /api/categories is accessible', async ({ request }) => {
    test.skip(!token, 'token not set — registration must pass first');

    const api = new CategoriesColorPage(request);
    const household = await api.createHousehold(token, 'SEC3 Color Test Household');

    expect(household.id).toBeTruthy();
    expect(household.invite_code).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Scenario 1: Invalid color — plain color name (e.g. "red") → 422
// ---------------------------------------------------------------------------

test.describe('SEC-3 Scenario 1 — invalid color returns 422', () => {
  test('POST /api/categories with color="red" returns HTTP 422', async ({ request }) => {
    test.skip(!token, 'token not set');

    const api = new CategoriesColorPage(request);
    const res = await api.createCategoryRaw(token, {
      name: 'Bad Color Category',
      color: 'red',
    });

    expect(res.status()).toBe(422);
  });

  test('422 response body contains a message referencing hex color format', async ({ request }) => {
    test.skip(!token, 'token not set');

    const api = new CategoriesColorPage(request);
    const res = await api.createCategoryRaw(token, {
      name: 'Bad Color Category Detail',
      color: 'red',
    });

    const body = await res.json();
    // FastAPI/Pydantic 422 body: { detail: [...] } where each item has a `msg` field
    const detail = JSON.stringify(body.detail ?? body);
    expect(detail.toLowerCase()).toMatch(/hex|color|colour|#[0-9a-f]/i);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Valid hex color (#FF5733) → 201, appears in list
// ---------------------------------------------------------------------------

test.describe('SEC-3 Scenario 2 — valid hex color succeeds', () => {
  test('POST /api/categories with color="#FF5733" returns 201 and echoes the color', async ({ request }) => {
    test.skip(!token, 'token not set');

    const api = new CategoriesColorPage(request);
    const category = await api.createCategory(token, {
      name: 'Valid Color Category',
      icon: '🎨',
      color: '#FF5733',
    });

    expect(category.id).toBeTruthy();
    expect(category.name).toBe('Valid Color Category');
    expect(category.color).toBe('#FF5733');
    expect(category.is_default).toBe(false);

    validCategoryId = category.id;
  });

  test('the newly created category with color=#FF5733 appears in GET /api/categories', async ({ request }) => {
    test.skip(!token || !validCategoryId, 'dependencies not ready');

    const api = new CategoriesColorPage(request);
    const categories = await api.getCategories(token);

    const found = categories.find(c => c.id === validCategoryId);
    expect(found).toBeDefined();
    expect(found!.color).toBe('#FF5733');
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Color omitted (optional field) → success
// ---------------------------------------------------------------------------

test.describe('SEC-3 Scenario 3 — color omitted succeeds', () => {
  test('POST /api/categories without a color field returns 2xx and color is null', async ({ request }) => {
    test.skip(!token, 'token not set');

    const api = new CategoriesColorPage(request);
    const category = await api.createCategory(token, {
      name: 'No Color Category',
    });

    expect(category.id).toBeTruthy();
    expect(category.name).toBe('No Color Category');
    expect(category.color).toBeNull();
    expect(category.is_default).toBe(false);
  });

  test('POST /api/categories with color=null explicitly returns 2xx and color is null', async ({ request }) => {
    test.skip(!token, 'token not set');

    const api = new CategoriesColorPage(request);
    const category = await api.createCategory(token, {
      name: 'Explicit Null Color',
      color: null,
    });

    expect(category.id).toBeTruthy();
    expect(category.color).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Additional edge cases
// ---------------------------------------------------------------------------

test.describe('SEC-3 Edge cases — additional invalid formats rejected with 422', () => {
  test('3-digit short hex (#FFF) is rejected with 422', async ({ request }) => {
    test.skip(!token, 'token not set');

    const api = new CategoriesColorPage(request);
    const res = await api.createCategoryRaw(token, {
      name: 'Short Hex Category',
      color: '#FFF',
    });

    expect(res.status()).toBe(422);
  });

  test('hex without leading hash (FF5733) is rejected with 422', async ({ request }) => {
    test.skip(!token, 'token not set');

    const api = new CategoriesColorPage(request);
    const res = await api.createCategoryRaw(token, {
      name: 'No Hash Hex Category',
      color: 'FF5733',
    });

    expect(res.status()).toBe(422);
  });

  test('lowercase valid hex (#ff5733) is accepted', async ({ request }) => {
    test.skip(!token, 'token not set');

    const api = new CategoriesColorPage(request);
    const category = await api.createCategory(token, {
      name: 'Lowercase Hex Category',
      color: '#ff5733',
    });

    expect(category.id).toBeTruthy();
    expect(category.color).toBe('#ff5733');
  });

  test('hex exceeding max_length=7 (e.g. "#FF5733X") is rejected with 422', async ({ request }) => {
    test.skip(!token, 'token not set');

    const api = new CategoriesColorPage(request);
    const res = await api.createCategoryRaw(token, {
      name: 'Too Long Hex Category',
      color: '#FF5733X',
    });

    expect(res.status()).toBe(422);
  });
});
