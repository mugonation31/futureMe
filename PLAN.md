# futureMe Design System

> **Status note (2026-06-08): Tasks 1–18 are all complete.**

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

---

## Feature: Budgeting — Transactions, Categories, Live Dashboard

### Overview

Delivers the core budgeting loop: set a budget → log expenses/income with categories → see real spending vs budget on the dashboard. Tasks 1–18 are complete. New tasks start at 19.

---

- [x] **Task 19 — DB migration: budget_categories and transactions tables** (Size: M)
  - **Description**: Create `supabase/migrations/20260608000004_transactions.sql`. Define `budget_categories` (id uuid PK default gen_random_uuid(), household_id uuid REFERENCES households(id) ON DELETE CASCADE — nullable, name text NOT NULL, icon text, color text, is_default boolean DEFAULT false, created_at timestamptz DEFAULT now(), UNIQUE (household_id, name)). Define `transactions` (id uuid PK default gen_random_uuid(), household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE, user_id uuid NOT NULL, category_id uuid REFERENCES budget_categories(id) ON DELETE SET NULL, amount numeric(12,2) NOT NULL, type text NOT NULL CHECK (type IN ('expense','income')), description text, date date NOT NULL DEFAULT CURRENT_DATE, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()). Add `updated_at` trigger on `transactions` reusing existing `set_updated_at()`. Add index on `transactions(household_id, date DESC)`.
  - **Depends on**: None (reuses `set_updated_at()` from migration 20260608000001)
  - **Files**: `supabase/migrations/20260608000004_transactions.sql` (new)
  - **Acceptance criteria**:
    - Migration applies to Neon without error
    - `budget_categories` and `transactions` tables exist with all columns and constraints
    - `INSERT` into `transactions` auto-populates `updated_at` via trigger
    - Index on `transactions(household_id, date DESC)` exists

- [x] **Task 20 — DB migration: seed default budget categories** (Size: S)
  - **Description**: Create `supabase/migrations/20260608000005_seed_categories.sql`. Allow `budget_categories.household_id` to be NULL (already nullable from Task 19). Add a partial unique index `UNIQUE (name) WHERE household_id IS NULL` to prevent duplicate defaults. Insert 10 default rows with `household_id = NULL` and `is_default = true`: Groceries, Rent/Mortgage, Transport, Utilities, Dining Out, Entertainment, Healthcare, Clothing, Savings, Income.
  - **Depends on**: Task 19
  - **Files**: `supabase/migrations/20260608000005_seed_categories.sql` (new)
  - **Acceptance criteria**:
    - Migration applies without error
    - `SELECT count(*) FROM budget_categories WHERE is_default = true` returns 10
    - Inserting a duplicate default category name raises a unique constraint error
    - `household_id` column accepts NULL

- [x] **Task 21 — Backend: Pydantic models for transactions and categories** (Size: S)
  - **Description**: Add to `backend/models.py`: `CategoryCreate` (name: str, icon: Optional[str], color: Optional[str]); `CategoryResponse` (id, household_id, name, icon, color, is_default, created_at); `TransactionCreate` (amount: float ge=0.01, type: Literal['expense','income'], description: Optional[str], date: date, category_id: Optional[str]); `TransactionUpdate` (all fields Optional matching TransactionCreate); `TransactionResponse` (id, household_id, user_id, category_id, amount, type, description, date, created_at, updated_at, category_name: Optional[str]). Also add `CategorySpend` (category_name: str, spent: float, budget: Optional[float]) and extend `DashboardStats` with `category_breakdown: list[CategorySpend] = []`.
  - **Depends on**: Task 19
  - **Files**: `backend/models.py`
  - **Acceptance criteria**:
    - All new models importable from `models.py`
    - `TransactionCreate.amount` rejects values <= 0
    - `TransactionCreate.type` rejects values other than `'expense'` and `'income'`
    - `DashboardStats` includes `category_breakdown` field defaulting to empty list
    - No existing models removed or broken

- [x] **Task 22 — Backend: categories and transactions DB operations** (Size: M)
  - **Description**: Add to `backend/database.py`: `get_categories(household_id: str) -> list[dict]` (returns rows where `household_id = $1 OR household_id IS NULL`); `create_category(household_id, name, icon, color) -> dict`; `create_transaction(household_id, user_id, data: TransactionCreate) -> dict` (joins category name on RETURNING); `get_transactions(household_id: str, month: Optional[str] = None) -> list[dict]` (month = 'YYYY-MM', joins category name, ordered by date DESC); `get_transaction(household_id, transaction_id) -> Optional[dict]`; `update_transaction(household_id, transaction_id, data: TransactionUpdate) -> dict`; `delete_transaction(household_id, transaction_id) -> bool`. Update `get_dashboard_stats(user_id, household_id)` to accept household_id and compute `total_spent` as `SUM(amount) WHERE type='expense' AND household_id=$hid AND date_trunc('month',date)=date_trunc('month',CURRENT_DATE)`, plus per-category breakdown via GROUP BY.
  - **Depends on**: Task 21
  - **Files**: `backend/database.py`
  - **Acceptance criteria**:
    - `get_categories` returns both default (household_id IS NULL) and household-specific rows
    - `create_transaction` returns dict with `category_name` field populated
    - `get_transactions` with `month='2026-06'` returns only June 2026 rows
    - `get_dashboard_stats` returns real `total_spent` from `transactions` table
    - All functions use `_serialize_row` and the `pool.acquire()` context-manager pattern

- [x] **Task 23 — Backend: categories and transactions API endpoints** (Size: M)
  - **Description**: Add to `backend/main.py`: `GET /api/categories` (returns default + household categories; 403 if no household); `POST /api/categories` (creates custom category for household; 403 if no household); `GET /api/transactions` (query param `month=YYYY-MM` optional, scoped to household; 403 if no household); `POST /api/transactions` (creates transaction; 403 if no household); `GET /api/transactions/{id}` (403 if not household member); `PATCH /api/transactions/{id}` (403 unless `transaction.user_id == context.user_id` or role == 'owner'); `DELETE /api/transactions/{id}` (same ownership rule). Update `GET /api/dashboard` to pass `context.household_id` to `get_dashboard_stats`; return zeroed stats if `household_id` is None rather than raising 500.
  - **Depends on**: Task 22
  - **Files**: `backend/main.py`
  - **Acceptance criteria**:
    - `GET /api/categories` returns at least 10 default categories for any authenticated user
    - `POST /api/transactions` with valid body returns HTTP 201 with `TransactionResponse`
    - `GET /api/transactions?month=2026-06` returns only June 2026 transactions
    - `PATCH /api/transactions/{id}` by a non-owning non-member user returns HTTP 403
    - `GET /api/dashboard` returns non-zero `total_spent` after transactions exist
    - Dashboard endpoint never returns 500 for a user without a household

- [x] **Task 24 — Frontend: transaction and category models + service** (Size: S)
  - **Description**: Create `frontend/src/app/transactions/models/transaction.model.ts` with interfaces: `Category` (id, household_id, name, icon, color, is_default); `Transaction` (id, household_id, user_id, category_id, amount, type, description, date, created_at, updated_at, category_name); `TransactionCreate` (amount, type, description, date, category_id). Create `frontend/src/app/transactions/services/transaction.service.ts` (Injectable, providedIn: 'root'). Methods: `getCategories(): Observable<Category[]>`; `getTransactions(month?: string): Observable<Transaction[]>`; `createTransaction(data: TransactionCreate): Observable<Transaction>`; `updateTransaction(id: string, data: Partial<TransactionCreate>): Observable<Transaction>`; `deleteTransaction(id: string): Observable<void>`. Use the same `getHeaders()` pattern used in `DashboardService` and `SettingsService`.
  - **Depends on**: Task 23
  - **Files**: `frontend/src/app/transactions/models/transaction.model.ts` (new), `frontend/src/app/transactions/services/transaction.service.ts` (new)
  - **Acceptance criteria**:
    - `TransactionService` is injectable and uses `AuthService.getToken()` for the auth header
    - All five methods present and return typed Observables
    - `Transaction` interface includes `category_name: string | null`
    - No circular dependencies introduced

- [x] **Task 25 — Frontend: transaction list page and inline add form** (Size: L)
  - **Description**: Create `frontend/src/app/transactions/components/transaction-list/transaction-list.component.ts` (standalone). Renders a monthly transaction list with columns: date, description, category, amount (red for expense via `--caution`, green for income via `--positive`). Month selector `<select>` defaults to current month and re-fetches on change. "Add Transaction" button toggles an inline `TransactionFormComponent`. Create `frontend/src/app/transactions/components/transaction-form/transaction-form.component.ts` (standalone): reactive form with amount, type (expense/income), category (populated from `getCategories()`), description, date. On submit calls `createTransaction()`, emits `(saved)` output event, list refreshes. Each transaction row has a delete icon button calling `deleteTransaction()` after `confirm()`. Use `.card`, `.btn-primary`, `.btn-ghost` from global `styles.scss`. Register `/transactions` in `app.routes.ts` guarded by `authGuard` + `householdGuard`.
  - **Depends on**: Task 24
  - **Files**: `frontend/src/app/transactions/components/transaction-list/transaction-list.component.ts` (new), `frontend/src/app/transactions/components/transaction-list/transaction-list.component.html` (new), `frontend/src/app/transactions/components/transaction-list/transaction-list.component.scss` (new), `frontend/src/app/transactions/components/transaction-form/transaction-form.component.ts` (new), `frontend/src/app/transactions/components/transaction-form/transaction-form.component.html` (new), `frontend/src/app/transactions/components/transaction-form/transaction-form.component.scss` (new), `frontend/src/app/app.routes.ts`
  - **Acceptance criteria**:
    - `/transactions` is accessible to authenticated users with a household; redirects otherwise
    - Transaction list renders all transactions for the selected month
    - Changing the month selector re-fetches and re-renders
    - Submitting the add form appends the new transaction to the list without full page reload
    - Delete button removes the row after API call succeeds
    - Expense amounts shown in `var(--caution)` colour, income in `var(--positive)`
    - Form validates: amount > 0, type required, date required

- [x] **Task 26 — Frontend: navigation link for transactions** (Size: S)
  - **Description**: Add a "Transactions" `<a routerLink="/transactions" routerLinkActive="active">` nav link to `navigation.component.html` alongside the existing links. Ensure it appears both in the desktop nav row and in the mobile expanded menu.
  - **Depends on**: Task 25
  - **Files**: `frontend/src/app/shared/navigation/navigation.component.html`
  - **Acceptance criteria**:
    - "Transactions" link is visible in the desktop nav bar
    - Link appears in the mobile hamburger menu
    - Active route highlights the link via `routerLinkActive`
    - No other nav links are broken

- [x] **Task 27 — Frontend + backend: dashboard with real spending data** (Size: M)
  - **Description**: Extend `DashboardStats` in `backend/models.py` to include `category_breakdown: list[CategorySpend]` (already added in Task 21). Update `backend/database.get_dashboard_stats` to compute per-category spending with GROUP BY. Update `frontend/src/app/dashboard/services/dashboard.service.ts` `DashboardStats` interface to add `category_breakdown: CategorySpend[]`. Update `DashboardComponent` template to: (a) render a "Spending by category" section below the top four stat cards — one row per category with a progress bar and spent amount; (b) if `total_budget === 0`, show a CTA card linking to `/settings`; (c) if no transactions, show an empty state card linking to `/transactions`. Fix `remaining_budget` to floor at 0. Fix `savings_rate` to use `((total_budget - total_spent) / total_budget) * 100` when budget > 0, else 0.
  - **Depends on**: Task 23, Task 25
  - **Files**: `backend/models.py`, `backend/database.py`, `backend/main.py`, `frontend/src/app/dashboard/services/dashboard.service.ts`, `frontend/src/app/dashboard/components/dashboard/dashboard.component.ts`, `frontend/src/app/dashboard/components/dashboard/dashboard.component.html`, `frontend/src/app/dashboard/components/dashboard/dashboard.component.scss`
  - **Acceptance criteria**:
    - Dashboard `total_spent` reflects real sum of current-month expense transactions for the household
    - `remaining_budget` never shows negative (floor at 0)
    - `savings_rate` is 0 when no budget is set
    - Category breakdown renders one row per category with transactions this month
    - Each category row has a progress bar proportional to `spent / total_budget`
    - Zero-budget state shows CTA linking to `/settings`
    - Zero-transactions state shows empty state linking to `/transactions`

- [x] **Task 28 — Backend + frontend: settings end-to-end polish** (Size: S)
  - **Description**: Fix two known gaps: (1) `backend/database.py` functions `get_user_settings` and `get_dashboard_stats` call `conn = await get_pool()` and use `conn` directly as a connection — replace with `async with pool.acquire() as conn` to be consistent and safe under concurrent load. (2) Frontend `SettingsService.updateSettings` currently sends the full form payload including null fields — filter out null/undefined values before sending so partial updates do not overwrite existing DB values with null. Add a 3-second auto-dismiss to the `successMessage` in `SettingsPageComponent` using `setTimeout`.
  - **Depends on**: None
  - **Files**: `backend/database.py`, `frontend/src/app/settings/services/settings.service.ts`, `frontend/src/app/settings/components/settings-page/settings-page.component.ts`
  - **Acceptance criteria**:
    - `GET /api/settings` no longer risks connection errors under load
    - Saving only `display_name` does not overwrite `monthly_budget` with null in the DB
    - Success message auto-dismisses after 3 seconds
    - No regressions in existing settings tests

- [x] **Task 29 — Frontend: currency-aware formatting pipe** (Size: S)
  - **Description**: Create `frontend/src/app/core/pipes/currency-format.pipe.ts` as a standalone Angular pipe (`appCurrency`). Injects `SettingsService`, reads current currency (GBP→£, USD→$, EUR→€, fallback to the code itself), and formats numbers as `symbol + value.toLocaleString(locale, {minimumFractionDigits:2, maximumFractionDigits:2})`. Returns `'--'` for null/undefined input. Replace the hardcoded `'£' + ...toLocaleString('en-GB', ...)` logic in `DashboardComponent.formatCurrency()` with this pipe. Apply the pipe to transaction amounts in `TransactionListComponent`.
  - **Depends on**: Task 27, Task 25
  - **Files**: `frontend/src/app/core/pipes/currency-format.pipe.ts` (new), `frontend/src/app/dashboard/components/dashboard/dashboard.component.ts`, `frontend/src/app/dashboard/components/dashboard/dashboard.component.html`, `frontend/src/app/transactions/components/transaction-list/transaction-list.component.html`
  - **Acceptance criteria**:
    - Changing currency to USD in settings causes dashboard and transaction list to show `$` prefix on next load
    - Pipe returns `'--'` for null/undefined input
    - Pipe is standalone and importable in any standalone component without module declaration
    - No hardcoded `'£'` remains in `DashboardComponent`

---

## Risks

- `get_dashboard_stats` currently ignores `household_id`. After Task 23 the signature changes — all callers in `main.py` must pass `context.household_id`. If `household_id` is None, return zeroed stats instead of raising 500.
- The seed migration (Task 20) inserts NULL-FK rows in `budget_categories`. The `get_categories` query must use `WHERE household_id = $1 OR household_id IS NULL`, not an INNER JOIN that would exclude nulls.
- Transaction edit/delete ownership check in Task 23 requires `transaction.user_id == context.user_id OR get_member_role() == 'owner'`. Both conditions require DB lookups — batch them or cache the role.
- `TransactionFormComponent` renders inline rather than as a modal or separate route — keeps the slice shippable but may need revisiting based on UX feedback.

## Open Questions

- Should per-category budget allocations be in scope? Task 27 carries `budget: null` in `CategorySpend` but no UI to set per-category budgets. Recommend deferring to a dedicated "Budget Allocation" feature.
- Should transactions be scoped to the household (all members see all) or to the individual user? Current plan scopes them to the household — confirm intended UX.
- Should the month filter on the transactions page default to the current calendar month or show all time? Plan defaults to current month.

---

## Deferred Security Backlog

Items explicitly deferred during the Tasks 21–23 dev cycle (2026-06-08). Must be completed before the first production deployment.

- [x] **SEC-1 — Shorten JWT access token lifetime and add refresh token endpoint** (Size: M)
  - **Description**: Supabase issues JWTs with a 7-day lifetime. Shorten the access token lifetime to 15–60 minutes (configurable via `SUPABASE_JWT_EXPIRY` env var). Add a `POST /api/auth/refresh` endpoint that accepts a refresh token and returns a new access token. Frontend must handle 401 responses by attempting a silent refresh before redirecting to login.
  - **Files**: `backend/auth.py`, `backend/main.py`, `frontend/src/app/core/services/auth.service.ts`
  - **Acceptance criteria**:
    - Access tokens expire in ≤ 60 minutes
    - A valid refresh token returns a new access token without requiring re-login
    - Expired access token mid-session triggers a silent refresh, not an immediate logout

- [x] **SEC-2 — Password complexity validation on signup** (Size: S)
  - **Description**: Add server-side and client-side validation requiring passwords to contain at least 1 digit and 1 special character (in addition to existing length check). Return a clear 422 error message listing the unmet requirements so the frontend can display them inline.
  - **Files**: `backend/main.py` (or `auth.py`), `frontend/src/app/auth/signup/signup.component.ts`
  - **Acceptance criteria**:
    - Signup with a password lacking a digit returns HTTP 422 with a descriptive message
    - Signup with a password lacking a special character returns HTTP 422
    - Frontend signup form shows inline errors before submission

- [x] **SEC-3 — Enforce `#RRGGBB` hex format on `CategoryCreate.color`** (Size: S)
  - **Description**: Add a Pydantic `field_validator` on `CategoryCreate.color` to reject values that do not match `^#[0-9A-Fa-f]{6}$`. Also validate `icon` against an allowlist of known icon names if one is defined, or at minimum enforce a max-length to prevent oversized payloads. Return 422 with a clear message on violation.
  - **Files**: `backend/models.py`
  - **Acceptance criteria**:
    - `POST /api/categories` with `color: "red"` returns HTTP 422
    - `POST /api/categories` with `color: "#FF5733"` is accepted
    - Existing category creation tests continue to pass

- [x] **SEC-4 — Tighten CORS configuration** (Size: S)
  - **Description**: Replace the current wildcard or broad CORS setup with an explicit allowlist. Restrict `allow_methods` to `["GET", "POST", "PATCH", "DELETE", "OPTIONS"]`. Restrict `allow_headers` to `["Authorization", "Content-Type"]`. `allow_origins` must be set from `CORS_ORIGINS` env var with no wildcard in production (`ENVIRONMENT=production`). Add a startup assertion that rejects a production boot with `CORS_ORIGINS=*`.
  - **Files**: `backend/main.py`, `backend/config.py`
  - **Acceptance criteria**:
    - A request with an unlisted `Origin` receives no `Access-Control-Allow-Origin` header
    - Backend refuses to start in production if `CORS_ORIGINS` contains `*`
    - Development mode continues to work with `CORS_ORIGINS=http://localhost:4200`

---

## Feature: Per-Category Budget Allocation

### Overview

Adds per-category monthly spending limits so the dashboard category breakdown can show progress bars against individual budgets rather than the single household total. Deferred from Task 27. New tasks start at 30.

---

- [x] **Task 30 — DB migration: category_budgets table** (Size: S)
  - **Description**: Create `supabase/migrations/20260608000006_category_budgets.sql`. Define `category_budgets` (id uuid PK default gen_random_uuid(), household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE, category_id uuid NOT NULL REFERENCES budget_categories(id) ON DELETE CASCADE, monthly_limit numeric(12,2) NOT NULL CHECK (monthly_limit > 0), created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), UNIQUE (household_id, category_id)). Add the `updated_at` auto-update trigger using the existing `set_updated_at()` function. Add an index on `category_budgets(household_id)`.
  - **Depends on**: Task 19 (budget_categories must exist)
  - **Files**: `supabase/migrations/20260608000006_category_budgets.sql` (new)
  - **Acceptance criteria**:
    - Migration applies to Neon without error
    - `category_budgets` table exists with all columns and the `(household_id, category_id)` unique constraint
    - Inserting a duplicate `(household_id, category_id)` pair raises a unique constraint error
    - `updated_at` is auto-updated via trigger on UPDATE
    - Index on `category_budgets(household_id)` exists

- [ ] **Task 31 — Backend: category budget Pydantic models and DB operations** (Size: M)
  - **Description**: Add to `backend/models.py`: `CategoryBudgetUpsert` (category_id: str, monthly_limit: float gt=0); `CategoryBudgetResponse` (id, household_id, category_id, category_name: Optional[str], monthly_limit, created_at, updated_at). Extend `CategorySpend` with `budget: Optional[float] = None`. Add to `backend/database.py`: `upsert_category_budget(household_id, category_id, monthly_limit) -> dict` (INSERT ... ON CONFLICT (household_id, category_id) DO UPDATE SET monthly_limit = EXCLUDED.monthly_limit, updated_at = NOW(), returns joined category name); `get_category_budgets(household_id) -> list[dict]` (joins budget_categories on category_id to include category_name, ordered by category_name ASC); `delete_category_budget(household_id, category_id) -> bool`. Update `get_dashboard_stats` to LEFT JOIN `category_budgets` in the category breakdown query so each `CategorySpend` row includes the matching `monthly_limit` (None if no budget set).
  - **Depends on**: Task 30, Task 21
  - **Files**: `backend/models.py`, `backend/database.py`
  - **Acceptance criteria**:
    - `CategoryBudgetUpsert.monthly_limit` rejects values <= 0
    - `upsert_category_budget` creates a new row on first call and updates `monthly_limit` on a second call for the same `(household_id, category_id)` pair
    - `get_category_budgets` returns `category_name` populated via JOIN
    - `get_dashboard_stats` category breakdown rows include `budget` field: a float when a limit is set, None when not
    - No existing models or DB functions are removed or broken

- [ ] **Task 32 — Backend: category budget API endpoints** (Size: S)
  - **Description**: Add to `backend/main.py`: `GET /api/category-budgets` (returns list of `CategoryBudgetResponse` for the household; 403 if no household); `PUT /api/category-budgets/{category_id}` (upserts a monthly limit for the given category; body is `CategoryBudgetUpsert`; 403 if no household; 404 if `category_id` does not belong to a default or household-specific category); `DELETE /api/category-budgets/{category_id}` (removes the limit; 403 if no household; 404 if no budget exists for that category; 204 on success). All three endpoints require owner or member role — no additional role check needed beyond household membership.
  - **Depends on**: Task 31
  - **Files**: `backend/main.py`
  - **Acceptance criteria**:
    - `GET /api/category-budgets` returns an empty list for a household with no budgets set
    - `PUT /api/category-budgets/{category_id}` with a valid body returns HTTP 200 with `CategoryBudgetResponse` including `category_name`
    - Calling `PUT` twice for the same category updates `monthly_limit` rather than creating a duplicate
    - `DELETE /api/category-budgets/{category_id}` returns HTTP 204 on success and HTTP 404 if no budget row exists
    - All three endpoints return HTTP 403 when `context.household_id` is None

- [ ] **Task 33 — Frontend: budget allocation panel in settings** (Size: M)
  - **Description**: Create `frontend/src/app/settings/components/budget-allocation/budget-allocation.component.ts` (standalone) with `.html` and `.scss`. The component fetches categories via `TransactionService.getCategories()` and existing budgets via a new `getBudgets()` call in `TransactionService`. Renders a list of categories; each row shows the category name and a numeric input for monthly limit (empty means no limit). A "Save" button at the bottom calls `PUT /api/category-budgets/{category_id}` for each row where a value was entered or changed, and `DELETE /api/category-budgets/{category_id}` for rows that were cleared. Add `getBudgets(): Observable<CategoryBudget[]>` and `upsertBudget(categoryId, limit): Observable<CategoryBudget>` and `deleteBudget(categoryId): Observable<void>` methods to `frontend/src/app/transactions/services/transaction.service.ts`. Add a `CategoryBudget` interface to `frontend/src/app/transactions/models/transaction.model.ts`. Embed `BudgetAllocationComponent` inside `SettingsPageComponent` template below the main settings form.
  - **Depends on**: Task 32, Task 24
  - **Files**: `frontend/src/app/settings/components/budget-allocation/budget-allocation.component.ts` (new), `frontend/src/app/settings/components/budget-allocation/budget-allocation.component.html` (new), `frontend/src/app/settings/components/budget-allocation/budget-allocation.component.scss` (new), `frontend/src/app/transactions/services/transaction.service.ts`, `frontend/src/app/transactions/models/transaction.model.ts`, `frontend/src/app/settings/components/settings-page/settings-page.component.html`, `frontend/src/app/settings/components/settings-page/settings-page.component.ts`
  - **Acceptance criteria**:
    - Budget allocation panel is visible on the `/settings` page below the existing form
    - All categories (default + household-specific) are listed with their current monthly limit pre-filled if set
    - Entering a value and saving calls `PUT /api/category-budgets/{category_id}` for that category
    - Clearing a value that previously had a budget and saving calls `DELETE /api/category-budgets/{category_id}`
    - Rows with no value and no prior budget are skipped (no API call made)
    - Success and error states are shown inline using the same `.card` and `.btn-primary` pattern as the rest of the settings page

- [ ] **Task 34 — Frontend: dashboard category breakdown with per-category budget progress** (Size: M)
  - **Description**: Update `frontend/src/app/dashboard/services/dashboard.service.ts` to extend the `DashboardStats` interface: add `category_breakdown: CategorySpend[]` where `CategorySpend` has `category_name: string`, `spent: number`, `budget: number | null`. Update `DashboardComponent` template (`dashboard.component.html`) to render a "Spending by category" section below the four stat cards: one row per entry in `category_breakdown`, showing (a) category name, (b) spent amount formatted via `appCurrency` pipe, (c) a horizontal progress bar — if `budget` is non-null, bar width = `min(100, (spent/budget)*100)%` with `var(--caution)` fill when >= 90% and `var(--color-accent)` otherwise; if `budget` is null, render a plain bar segment without a percentage. Add `(d)` the budget limit formatted via `appCurrency` when set, or the text "No limit" when null. Update `dashboard.component.scss` to style the progress bar. If `category_breakdown` is empty, show the empty-state card linking to `/transactions` that was planned in Task 27.
  - **Depends on**: Task 33, Task 27, Task 29
  - **Files**: `frontend/src/app/dashboard/services/dashboard.service.ts`, `frontend/src/app/dashboard/components/dashboard/dashboard.component.html`, `frontend/src/app/dashboard/components/dashboard/dashboard.component.ts`, `frontend/src/app/dashboard/components/dashboard/dashboard.component.scss`
  - **Acceptance criteria**:
    - Dashboard "Spending by category" section renders one row per category that has transactions in the current month
    - Each row with a budget set shows a filled progress bar; at >= 90% of limit the bar turns `var(--caution)`
    - Each row with no budget set shows a plain unscaled bar segment
    - Budget and spent amounts use the `appCurrency` pipe (no hardcoded `'£'`)
    - Empty `category_breakdown` shows the empty-state card with a link to `/transactions`
    - Dashboard still renders without errors when `household_id` is null (zeroed stats, no breakdown rows)

---

## Risks

- `upsert_category_budget` relies on `ON CONFLICT (household_id, category_id)` — the unique constraint in Task 30 must be on those two columns exactly; any typo in the migration silently allows duplicates.
- The budget allocation "Save" in Task 33 fires N parallel PUT/DELETE calls. Under slow network, partial failures are possible. Recommend wrapping in `forkJoin` and rolling back UI state if any call fails.
- `CategorySpend.budget` is a new nullable field added to the existing `DashboardStats` response. The frontend `DashboardStats` interface must be updated before the backend deploys, or the dashboard will silently drop the field.
- Task 34 depends on Task 29 (`appCurrency` pipe) being implemented. If Task 29 is skipped, use `formatCurrency()` method as a temporary fallback and note the debt.

## Open Questions

- Should category budgets be per-calendar-month (reset on the 1st) or rolling 30-day? Current plan uses calendar month (consistent with `get_dashboard_stats`).
- Should household members be able to set category budgets, or only the owner? Current plan allows any household member to upsert/delete budgets — confirm intended permission model.
- Should the dashboard show a "total allocated" figure (sum of all category limits) alongside the household monthly budget? Deferred; can be added to Task 34 if confirmed.

---

## Feature: Reset Password

### Overview

Adds a complete forgot/reset password flow: backend generates a short-lived signed token, sends a reset email via Resend, and exposes two endpoints. Frontend adds a `/forgot-password` page (email input) and a `/reset-password` page (new password input, token from URL). A "Forgot password?" link is added to the login form.

---

- [x] **Task 38 — DB migration: password_reset_tokens table** (Size: S)
  - **Description**: Create `supabase/migrations/20260608000007_password_reset_tokens.sql`. Define `password_reset_tokens` table: id uuid PK default gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash text UNIQUE NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz DEFAULT now(). Add index on `(token_hash)` for fast lookup. Apply to Neon.
  - **Depends on**: Task 36 (users table must exist)
  - **Files**: `supabase/migrations/20260608000007_password_reset_tokens.sql` (new)
  - **Acceptance criteria**:
    - Migration applies to Neon without error
    - `password_reset_tokens` table exists with all columns and constraints
    - Index on `(token_hash)` exists
    - Inserting a duplicate `token_hash` raises a unique constraint error

- [x] **Task 39 — Backend: email service + forgot/reset password endpoints** (Size: M)
  - **Description**: Create `backend/email_service.py` with async `send_password_reset_email(to_email, reset_url)` using Resend. Add `frontend_url: str = "http://localhost:4200"` to `backend/config.py`. Add `RESEND_API_KEY` and `RESEND_FROM_EMAIL` to config if missing. Add Pydantic models `ForgotPasswordRequest` and `ResetPasswordRequest` to `backend/models.py`. Add DB functions to `backend/database.py`: `create_password_reset_token`, `get_password_reset_token`, `mark_reset_token_used`, `update_user_password`. Add `POST /api/auth/forgot-password` endpoint (always returns 200, generates signed JWT, stores sha256 hash, sends reset email) and `POST /api/auth/reset-password` endpoint (verifies JWT + purpose, looks up hash, rejects expired/used tokens, updates password). Add `resend` to `backend/requirements.txt`.
  - **Depends on**: Task 38
  - **Files**: `backend/email_service.py` (new), `backend/config.py`, `backend/models.py`, `backend/database.py`, `backend/main.py`, `backend/requirements.txt`
  - **Acceptance criteria**:
    - `POST /api/auth/forgot-password` with registered email returns 200, sends email with reset link
    - `POST /api/auth/forgot-password` with unknown email returns 200 (no enumeration)
    - `POST /api/auth/reset-password` with valid unused token returns 200; user can log in with new password
    - `POST /api/auth/reset-password` with expired token returns 400
    - `POST /api/auth/reset-password` with already-used token returns 400
    - `POST /api/auth/reset-password` with password < 6 chars returns 422

- [x] **Task 40 — Frontend: forgot-password and reset-password pages** (Size: M)
  - **Description**: Create standalone `ForgotPasswordComponent` at `/forgot-password` (email form, success message on submit, mirrors login card layout). Create standalone `ResetPasswordComponent` at `/reset-password` (reads `token` query param, shows error if absent, password + confirm form, navigates to `/login?reset=success` on success). Add "Forgot password?" link to `login.component.html` below password field. Add success banner to login page when `?reset=success` param is present. Register both routes in `app.routes.ts` without auth guards.
  - **Depends on**: Task 39
  - **Files**: `frontend/src/app/auth/forgot-password/` (new — 3 files), `frontend/src/app/auth/reset-password/` (new — 3 files), `frontend/src/app/auth/login/login.component.html`, `frontend/src/app/auth/login/login.component.ts`, `frontend/src/app/app.routes.ts`
  - **Acceptance criteria**:
    - `/forgot-password` accessible without auth; email submit shows success message
    - `/reset-password` without token param shows error immediately
    - Valid token + matching passwords (>= 6 chars) navigates to `/login?reset=success`
    - Login page shows success banner when `?reset=success` is present
    - "Forgot password?" link visible on login page below password field
    - Both new pages match existing login/signup visual style

---

## Feature: Auth/Landing CSS Polish + Backend Bring-Up

### Overview

Two immediate tasks: (1) raise auth and landing SCSS to production quality by replacing all hardcoded colours with design tokens from `styles.scss`; (2) apply three pending Neon migrations, install `passlib[bcrypt]` in the venv, and verify the FastAPI server starts cleanly on port 8002.

---

- [x] **Task 35 — CSS polish: login, signup, and landing pages** (Size: S)
  - **Description**: Audit and rewrite `login.component.scss`, `signup.component.scss`, and `landing.component.scss`. Replace every hardcoded hex colour with CSS custom properties defined in `styles.scss` (`--accent`, `--bg-app`, `--bg-card`, `--text-primary`, `--text-muted`, `--border`, `--shadow-card`). Replace `.login-button` / `.signup-button` rules with the global `.btn-primary` class applied directly in HTML. Fix `display: inline-block` on `.btn-primary` and `.btn-ghost` in `styles.scss` so they work on `<a>` tags. Replace `padding: 10px` literals with `var(--space-sm)`. Add `color: var(--text-muted)` to `.landing-footer`.
  - **Depends on**: None
  - **Files**: `frontend/src/app/auth/login/login.component.scss`, `frontend/src/app/auth/login/login.component.html`, `frontend/src/app/auth/signup/signup.component.scss`, `frontend/src/app/auth/signup/signup.component.html`, `frontend/src/app/landing/landing.component.scss`, `frontend/src/styles.scss`
  - **Acceptance criteria**:
    - No hardcoded hex values (`#...`) in any of the three SCSS files
    - `.btn-primary` and `.btn-ghost` have `display: inline-block` in `styles.scss`
    - Login and signup forms use `.btn-primary` class on the submit button
    - All spacing uses `var(--space-*)` tokens; no literal `px` padding values
    - `ng build` completes without errors

- [x] **Task 36 — Backend: apply Neon migrations 3-5** (Size: S)
  - **Description**: Apply the three pending SQL migration files to Neon in order using `psql`. The `DATABASE_URL` is in `backend/.env`. Migrations to apply: `supabase/migrations/20260608000003_users.sql` (creates `users` table), `supabase/migrations/20260608000004_transactions.sql` (creates `budget_categories` and `transactions` tables), `supabase/migrations/20260608000005_seed_categories.sql` (seeds 10 default categories). Verify each migration with a SELECT after applying.
  - **Depends on**: None (Neon already has households/household_members from earlier migrations)
  - **Files**: `supabase/migrations/20260608000003_users.sql`, `supabase/migrations/20260608000004_transactions.sql`, `supabase/migrations/20260608000005_seed_categories.sql`
  - **Acceptance criteria**:
    - All three migrations apply without errors
    - `SELECT count(*) FROM users` returns 0 (table exists, empty)
    - `SELECT count(*) FROM budget_categories WHERE is_default = true` returns 10
    - `SELECT count(*) FROM transactions` returns 0 (table exists, empty)

- [x] **Task 37 — Backend: install dependencies and verify server starts** (Size: S)
  - **Description**: Create/recreate the backend venv at `backend/venv`, install all dependencies from `backend/requirements.txt` (which includes `passlib[bcrypt]==1.7.4`). Start the server with `uvicorn main:app --reload --port 8002` from `backend/` and confirm it starts without import errors. Hit `GET /health` to verify a 200 response.
  - **Depends on**: Task 36 (DB tables must exist for pool init)
  - **Files**: `backend/requirements.txt` (no changes needed)
  - **Acceptance criteria**:
    - `pip install -r requirements.txt` completes with no errors
    - `python3 -c "from passlib.hash import bcrypt; bcrypt.hash('test')"` succeeds inside the venv
    - `uvicorn main:app --reload --port 8002` logs "Application startup complete"
    - `GET http://localhost:8002/health` returns `{"status": "OK"}`
