/**
 * Test user fixtures.
 *
 * SETUP REQUIRED: These tests require a live Supabase project.
 * Override with environment variables before running:
 *
 *   TEST_OWNER_EMAIL=owner@example.com
 *   TEST_OWNER_PASSWORD=ownerpassword
 *   TEST_MEMBER_EMAIL=member@example.com
 *   TEST_MEMBER_PASSWORD=memberpassword
 *   TEST_NEW_EMAIL=new+<timestamp>@example.com  (auto-generated below)
 *   TEST_OWNER_TOKEN=<valid JWT for owner — has a household>
 *   TEST_MEMBER_TOKEN=<valid JWT for member — same household>
 *   TEST_NO_HOUSEHOLD_TOKEN=<valid JWT for user with no household>
 */

const ts = Date.now();

export const testUsers = {
  /** Existing user who already owns a household */
  owner: {
    email: process.env['TEST_OWNER_EMAIL'] ?? 'owner@futureme-test.example.com',
    password: process.env['TEST_OWNER_PASSWORD'] ?? 'TestPassword1!',
  },
  /** Existing user who is a member (not owner) of a household */
  member: {
    email: process.env['TEST_MEMBER_EMAIL'] ?? 'member@futureme-test.example.com',
    password: process.env['TEST_MEMBER_PASSWORD'] ?? 'TestPassword1!',
  },
  /** Existing authenticated user who has NO household yet */
  noHousehold: {
    email: process.env['TEST_NO_HOUSEHOLD_EMAIL'] ?? 'nohousehold@futureme-test.example.com',
    password: process.env['TEST_NO_HOUSEHOLD_PASSWORD'] ?? 'TestPassword1!',
  },
  /** Brand-new user — unique per run to avoid "already registered" errors */
  newUser: {
    name: 'Test User',
    email: process.env['TEST_NEW_EMAIL'] ?? `test.${ts}@futureme-test.example.com`,
    password: 'TestPassword1!',
  },
};

/** Pre-issued JWTs for API-only tests (avoids UI login round-trip). */
export const testTokens = {
  owner: process.env['TEST_OWNER_TOKEN'] ?? '',
  member: process.env['TEST_MEMBER_TOKEN'] ?? '',
  noHousehold: process.env['TEST_NO_HOUSEHOLD_TOKEN'] ?? '',
};
