# futureMe Design System

## Overview
Foundation styling pass across 5 files. All tasks are implementation tasks.

## Tasks

- [x] **Task 1 — Design tokens, resets, and utility classes** (Size: M)
  - **Description**: Replace entire contents of `styles.scss` with CSS custom properties, resets, base typography, and utility classes. New spacing tokens: `--space-xs` (4px), `--space-sm` (8px), `--space-md` (16px), `--space-lg` (24px), `--space-xl` (40px). New `--bg-app` background token. New utility classes: `.card`, `.btn-primary`, `.btn-ghost`, `.text-muted`, `.text-accent`, `.text-positive`, `.text-caution`, `.tabular-nums`.
  - **Depends on**: None
  - **Files**: `frontend/src/styles.scss`
  - **Acceptance criteria**:
    - All named CSS custom properties (`--space-xs` through `--space-xl`, `--bg-app`, colour tokens) are defined on `:root`
    - `.card`, `.btn-primary`, `.btn-ghost` are defined and usable without component-level overrides
    - `.text-muted`, `.text-accent`, `.text-positive`, `.text-caution`, `.tabular-nums` utility classes exist
    - Box-sizing reset and base typography are present
    - No references to old "Invoice Me" variable names remain

- [x] **Task 2 — Inter font import** (Size: S)
  - **Description**: Add Google Fonts `preconnect` links and the Inter stylesheet link (weights 400/500/600/700, `display=swap`) to `index.html`.
  - **Depends on**: None
  - **Files**: `frontend/src/index.html`
  - **Acceptance criteria**:
    - `<link rel="preconnect" href="https://fonts.googleapis.com">` is present in `<head>`
    - `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` is present in `<head>`
    - Inter stylesheet link with weights 400, 500, 600, 700 and `display=swap` is present in `<head>`
    - No other font imports are added

- [x] **Task 3 — App shell layout** (Size: S)
  - **Description**: Rewrite `app.component.scss` so `:host` is a full-height flex column with `background: var(--bg-app)`, and `.app-content` is centred at max-width 1100px with appropriate padding.
  - **Depends on**: Task 1 (`--bg-app` token must be defined)
  - **Files**: `frontend/src/app/app.component.scss`
  - **Acceptance criteria**:
    - `:host` uses `display: flex`, `flex-direction: column`, `min-height: 100vh`, and `background: var(--bg-app)`
    - `.app-content` has `max-width: 1100px`, `margin: 0 auto`, and padding on both sides
    - No hardcoded colour values remain in this file

- [x] **Task 4 — Navigation redesign** (Size: M)
  - **Description**: Rewrite `navigation.component.html` to a 3-column layout — brand on the left, nav links centred, greeting and logout on the right. Update `navigation.component.scss` to implement this layout while retaining the mobile hamburger collapse behaviour.
  - **Depends on**: Task 1 (spacing and colour tokens)
  - **Files**: `frontend/src/app/shared/navigation/navigation.component.html`, `frontend/src/app/shared/navigation/navigation.component.scss`
  - **Acceptance criteria**:
    - On desktop (>960px) the navbar shows three distinct columns: brand left, links centre, greeting+logout right
    - On mobile (<=960px) the hamburger button is visible and toggles the nav menu open/closed
    - Mobile expanded menu stacks links vertically with logout at the bottom
    - Design token variables are used for colours and spacing where possible; no hardcoded hex values for colours that have a token equivalent

- [x] **Task 5 — Footer redesign** (Size: S)
  - **Description**: Rewrite the inline template and styles inside `footer.component.ts`. Update the brand name from "Invoice Me" to "futureMe". Use design tokens (`--space-*`, colour tokens) in the inline styles.
  - **Depends on**: Task 1 (design tokens must be defined)
  - **Files**: `frontend/src/app/shared/footer/footer.component.ts`
  - **Acceptance criteria**:
    - Brand name displayed in the footer is "futureMe"
    - Footer background, text colours, and padding use CSS custom properties from the design system
    - Responsive behaviour (stacking on small screens) is retained
    - `currentYear` binding is preserved

## Risks
- Tasks 3, 4, and 5 depend on Task 1 tokens being correct. If token names change during Task 1, referencing files must be updated accordingly.
- Replacing `styles.scss` in full will remove all existing global button and form styles. Any component that relied on `.btn-secondary`, `.btn-success`, `.btn-danger`, `.form-input`, or `.badge-*` classes will lose styling — verify no components use those classes before removing them, or carry them forward.

## Open Questions
- Should `.btn-ghost` be a standalone button style or an extension of a base `.btn` class (i.e., does a `.btn` base class belong in the new `styles.scss`)?
- What are the exact colour values for `--text-accent`, `--text-positive`, and `--text-caution` in the new design system?
- Should `--bg-app` be a light neutral or match the current `--bg-primary: #f7fafc`?

---

## Auth + Household

## Overview
Builds the household membership model (DB, backend API, frontend onboarding, guards). All tasks ordered so each depends only on what came before.

## Tasks

- [x] **Task 6 — Supabase migration: households and household_members tables** (Size: M)
  - **Description**: Create `supabase/migrations/` directory and add migration file `20260524000001_households.sql`. Define `households` (id uuid PK default gen_random_uuid(), name text not null, invite_code text unique, created_at timestamptz default now(), created_by uuid references auth.users) and `household_members` (id uuid PK default gen_random_uuid(), household_id uuid FK → households, user_id uuid FK → auth.users, role text check role in ('owner','member'), joined_at timestamptz default now()). Add unique constraint on (household_id, user_id). Enable RLS on both tables. Add RLS policies: on `households`, SELECT/UPDATE only if the requesting user exists in `household_members` for that household_id; on `household_members`, SELECT only if user_id = auth.uid() or the user belongs to the same household. Add a Postgres function `generate_invite_code()` that returns a random 8-char uppercase alphanumeric string using `substr(upper(replace(encode(gen_random_bytes(6), 'base64'), '/', '')), 1, 8)` or equivalent, and a trigger on `households` INSERT to populate `invite_code` when null.
  - **Depends on**: None
  - **Files**: `supabase/migrations/20260524000001_households.sql` (new)
  - **Acceptance criteria**:
    - Migration file applies without error against a clean Supabase project
    - `households` and `household_members` tables exist with correct columns and constraints
    - Inserting a row into `households` with no `invite_code` auto-populates an 8-char alphanumeric code
    - `invite_code` column has a UNIQUE constraint
    - RLS is enabled on both tables and raw SELECT without auth returns no rows

- [x] **Task 7 — Backend: household Pydantic models** (Size: S)
  - **Description**: Add household request/response models to `backend/models.py`: `HouseholdCreate` (name: str), `HouseholdJoin` (invite_code: str), `HouseholdResponse` (id, name, invite_code, created_at, created_by), `HouseholdMemberResponse` (id, household_id, user_id, role, joined_at), and `CurrentUserContext` (user_id: str, household_id: Optional[str]) to carry auth + household resolution through endpoints.
  - **Depends on**: Task 6 (schema must be settled before models are written)
  - **Files**: `backend/models.py`
  - **Acceptance criteria**:
    - All five new models are importable from `models.py`
    - `HouseholdResponse` includes `invite_code` field
    - `CurrentUserContext` carries both `user_id` and optional `household_id`
    - No existing models are removed or broken

- [x] **Task 8 — Backend: household database operations** (Size: M)
  - **Description**: Add four async functions to `backend/database.py`: `create_household(user_id, name) → dict` (inserts household row — invite_code auto-generated by DB trigger — then inserts household_members row with role='owner', returns household dict); `get_household_by_user(user_id) → Optional[dict]` (joins household_members → households to find the household for a given user); `get_household_by_invite_code(invite_code) → Optional[dict]`; `join_household(user_id, household_id) → dict` (inserts household_members row with role='member', raises if user already in a household).
  - **Depends on**: Task 6, Task 7
  - **Files**: `backend/database.py`
  - **Acceptance criteria**:
    - `create_household` inserts both `households` and `household_members` rows in a single transaction
    - `get_household_by_user` returns None when user has no household
    - `join_household` raises an exception (e.g. asyncpg.UniqueViolationError or explicit ValueError) if user already belongs to a household
    - All functions use the existing connection pool pattern

- [x] **Task 9 — Backend: update auth.py to resolve household_id** (Size: S)
  - **Description**: Change `get_current_user` in `backend/auth.py` to return a `CurrentUserContext` object (user_id + household_id) instead of a bare string. Call `db.get_household_by_user(user_id)` to populate `household_id` (None if user has no household yet). Update all existing endpoint `Depends(get_current_user)` call-sites in `main.py` to destructure `user_id` from the context object.
  - **Depends on**: Task 7, Task 8
  - **Files**: `backend/auth.py`, `backend/main.py`
  - **Acceptance criteria**:
    - `get_current_user` dependency returns `CurrentUserContext` with both fields
    - `household_id` is None (not an error) when user has no household yet
    - Existing `/api/settings` and `/api/dashboard` endpoints still work — they use `context.user_id`
    - No endpoints regress; existing tests continue to pass

- [x] **Task 10 — Backend: household endpoints** (Size: M)
  - **Description**: Add three new route handlers to `backend/main.py`: `POST /api/households` creates a household for the current user (returns 409 if user already has one); `GET /api/households/me` returns the current user's household including invite_code (returns 404 if none); `POST /api/households/join` accepts `HouseholdJoin` body, looks up household by invite_code (404 if not found), calls `join_household` (409 if already a member), returns the household.
  - **Depends on**: Task 9
  - **Files**: `backend/main.py`
  - **Acceptance criteria**:
    - `POST /api/households` with a valid auth token and name creates a household and returns `HouseholdResponse` with a non-empty `invite_code`
    - Calling `POST /api/households` a second time for the same user returns HTTP 409
    - `GET /api/households/me` returns the household after creation
    - `POST /api/households/join` with a valid invite_code from a different user's household returns HTTP 200 with the household
    - `POST /api/households/join` with an invalid invite_code returns HTTP 404

- [x] **Task 11 — Frontend: household service + fix environment.ts port** (Size: S)
  - **Description**: Fix `environment.ts` `apiUrl` from `http://localhost:8001/api` to `http://localhost:8002/api`. Then create `frontend/src/app/household/services/household.service.ts`. Injectable service using `HttpClient` + `SupabaseService.getAccessToken()` for auth headers. Expose three methods returning Observables: `createHousehold(name: string)`, `getMyHousehold()`, `joinHousehold(inviteCode: string)`. Export a `Household` interface (id, name, invite_code, created_at). Add a `currentHousehold$` BehaviorSubject<Household | null> that is updated after successful create/join calls and on `getMyHousehold()`.
  - **Depends on**: Task 10
  - **Files**: `frontend/src/environments/environment.ts`, `frontend/src/app/household/services/household.service.ts` (new)
  - **Acceptance criteria**:
    - `environment.ts` `apiUrl` is `http://localhost:8002/api`
    - Service is injectable (`providedIn: 'root'`)
    - All three methods send the `Authorization: Bearer <token>` header
    - `Household` interface matches the backend `HouseholdResponse` shape
    - `currentHousehold$` BehaviorSubject is updated after successful create/join calls

- [x] **Task 12 — Frontend: household guard** (Size: S)
  - **Description**: Create `frontend/src/app/auth/guards/household.guard.ts` as a `CanActivateFn`. Logic: if user is authenticated but `HouseholdService.currentHousehold$` is null after a `getMyHousehold()` fetch, redirect to `/onboarding`; otherwise allow activation. Apply the guard to the `dashboard` and `settings` routes in `app.routes.ts`.
  - **Depends on**: Task 11
  - **Files**: `frontend/src/app/auth/guards/household.guard.ts` (new), `frontend/src/app/app.routes.ts`
  - **Acceptance criteria**:
    - Authenticated user with a household can navigate to `/dashboard` without redirect
    - Authenticated user without a household is redirected to `/onboarding`
    - Unauthenticated user is still handled by `authGuard` first
    - Guard is applied to both `dashboard` and `settings` routes in `app.routes.ts`

- [x] **Task 13 — Frontend: onboarding component** (Size: M)
  - **Description**: Create `frontend/src/app/onboarding/onboarding.component.ts` (standalone), `.html`, and `.scss`. The UI presents two cards side by side (stacks on mobile): "Create a household" with a household name text input + submit button, and "Join a household" with an invite code input + submit button. On successful create or join, navigate to `/dashboard`. Show inline error messages on failure. Apply futureMe design tokens (`.card`, `.btn-primary` from `styles.scss`). Register the route `/onboarding` in `app.routes.ts` so only authenticated users without a household can access it; redirect authenticated users who already have a household to `/dashboard`.
  - **Depends on**: Task 11, Task 12
  - **Files**: `frontend/src/app/onboarding/onboarding.component.ts` (new), `frontend/src/app/onboarding/onboarding.component.html` (new), `frontend/src/app/onboarding/onboarding.component.scss` (new), `frontend/src/app/app.routes.ts`
  - **Acceptance criteria**:
    - `/onboarding` route is accessible to authenticated users with no household
    - Authenticated users who already have a household are redirected away from `/onboarding` to `/dashboard`
    - Submitting "Create a household" with a non-empty name calls `HouseholdService.createHousehold()` and navigates to `/dashboard` on success
    - Submitting "Join a household" with a valid invite code calls `HouseholdService.joinHousehold()` and navigates to `/dashboard` on success
    - Error states show an inline message without navigating
    - Component uses `.card`, `.btn-primary`, and CSS custom properties from the design system

- [x] **Task 14 — Frontend: rebrand auth screens** (Size: S)
  - **Description**: Update login and signup components to remove all "Invoice Me" references. Change login subtitle to "Sign in to futureMe" and signup subtitle to "Create your futureMe account". Replace hardcoded purple gradient in both `.scss` files with `var(--color-accent)` and `var(--bg-app)`. Update `signup.component.ts` post-signup redirect to navigate to `/onboarding` immediately (remove any delay). Update `login.component.ts` post-login: call `HouseholdService.getMyHousehold()` first; if household exists navigate to `/dashboard`, else navigate to `/onboarding`.
  - **Depends on**: Task 11, Task 13 (route must exist before navigating to it)
  - **Files**: `frontend/src/app/auth/login/login.component.html`, `frontend/src/app/auth/login/login.component.scss`, `frontend/src/app/auth/login/login.component.ts`, `frontend/src/app/auth/signup/signup.component.html`, `frontend/src/app/auth/signup/signup.component.scss`, `frontend/src/app/auth/signup/signup.component.ts`
  - **Acceptance criteria**:
    - No text "Invoice Me" appears in any auth screen
    - Login subtitle reads "Sign in to futureMe"
    - Signup subtitle reads "Create your futureMe account"
    - After successful signup, user is navigated to `/onboarding` immediately
    - After successful login, user with an existing household goes to `/dashboard`; user without a household goes to `/onboarding`
    - Auth screen colours use design tokens, no hardcoded purple gradient hex values remain

## Risks
- Task 9 changes `get_current_user` return type from `str` to `CurrentUserContext` — a breaking change. All call-sites in `main.py` must be updated atomically.
- The DB trigger for `invite_code` generation relies on `gen_random_bytes`. If unavailable, fallback: `substr(md5(random()::text || clock_timestamp()::text), 1, 8)`.
- `household.guard.ts` makes an HTTP call on every guarded route activation — mitigated by `currentHousehold$` BehaviorSubject cache in HouseholdService.
- Login redirect in Task 14 requires subscribing to an Observable before navigation — use `firstValueFrom` to avoid timing bugs.

## Open Questions
- Should the invite code lookup be case-insensitive? Recommend yes — store uppercase, normalise input to uppercase before lookup.
- What should happen if a user tries to join when they already belong to a different household? Planned as HTTP 409; UX copy TBD.
- Should a household owner be able to list members? Not in scope now, but RLS design should not foreclose it.

---

## Feature: Neon Database Migration

Switch the project's PostgreSQL backend from Supabase-hosted Postgres to Neon. Auth stays on Supabase (JWT). The backend already enforces auth at the API layer via explicit `user_id` filtering — no DB-level RLS is needed on Neon.

### Task 15 — Neon migration file: adapt SQL for standard PostgreSQL (Size: S)

**Description**: Create `supabase/migrations/20260608000001_neon_households.sql` — a Neon-compatible adaptation of `20260524000001_households.sql`. Remove `REFERENCES auth.users` FK constraints from `households.created_by` and `household_members.user_id` (keep as plain `uuid`). Remove all five RLS policies and both `ENABLE ROW LEVEL SECURITY` statements. Keep table DDL, unique constraints, `generate_invite_code()` function, trigger function, and trigger unchanged.

**Depends on**: None

**Files**:
- `supabase/migrations/20260608000001_neon_households.sql` (new)

**Acceptance criteria**:
- File contains no `auth.users`, `auth.uid()`, `ROW LEVEL SECURITY`, or `CREATE POLICY`
- `households` and `household_members` tables created with correct columns and constraints
- `generate_invite_code()` function and `trg_households_invite_code` trigger present and valid

---

### Task 16 — Apply migration to Neon (Size: S)

**Description**: Apply the adapted migration from Task 15 to the Neon project `proud-salad-21467632`. Verify tables and trigger exist by running `\dt` and a test `INSERT` to confirm `invite_code` is auto-populated.

**Depends on**: Task 15

**Acceptance criteria**:
- Migration applies without errors
- `households` and `household_members` tables exist in `neondb`
- INSERT into `households` without `invite_code` produces a non-null 8-char uppercase value

---

### Task 17 — Update backend/.env.example for Neon (Size: S)

**Description**: Replace Supabase `DATABASE_URL` placeholder with Neon-format placeholder (`postgresql://neondb_owner:your-neon-password@ep-your-endpoint-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require`). Add comment that `sslmode=require` is mandatory. Do NOT commit the real credential. Also add missing `RESEND_API_KEY` and `RESEND_FROM_EMAIL` placeholders.

**Depends on**: None

**Files**:
- `backend/.env.example`

**Acceptance criteria**:
- `DATABASE_URL` shows Neon URL format with `?sslmode=require`
- No real credential or `supabase.co` database host remains
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` placeholders present

---

### Task 18 — Verify backend connects to Neon (Size: S)

**Description**: Set real Neon `DATABASE_URL` in local `backend/.env` (not committed). Start backend and confirm asyncpg pool connects. Hit `GET /health` and an authenticated endpoint to confirm a real DB round-trip succeeds. Note: existing `ssl.create_default_context()` in `database.py` is already correct for Neon.

**Depends on**: Task 16, Task 17

**Files**:
- `backend/database.py` (comment only if SSL adjustment needed)
- `backend/.env` (local only, never committed)

**Acceptance criteria**:
- `uvicorn` starts without connection errors
- `GET /health` returns HTTP 200
- Authenticated endpoint returns non-500 response confirming DB is reachable

---

**Risks**:
- Neon pooler endpoint uses PgBouncer (transaction mode). If asyncpg uses prepared statements, use the non-pooler endpoint instead.
- `gen_random_bytes` requires `pgcrypto` — available by default on Neon Postgres 14+, but verify before applying migration.
- Real Neon credential must never appear in any committed file.
