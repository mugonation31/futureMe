# futureMe — Feature Rebuild Plan

## Context
The app was previously built with the wrong features (generic expense tracker). This plan strips that out and builds the 6 agreed core screens on the solid foundation that exists (auth, household, design system, core services).

## Foundation (complete — do not touch)
- Auth: login, signup, forgot/reset password
- Household: onboarding, invite codes, household guard
- Design system: CSS tokens, nav shell, layout
- Core services: auth, api
- Settings: display_name, currency (simplified)
- Infrastructure: FastAPI, Neon PostgreSQL, Angular 17, Docker ports 4202/8002

---

## Tasks

### Task 1 — Cleanup [x]
Remove all fluff that diverged from the agreed vision.

**Frontend — delete:**
- `frontend/src/app/transactions/` (entire folder)
- Budget allocation component in settings (find and remove)
- Any categories management UI

**Backend — remove from main.py, database.py, models.py:**
- All `/api/transactions` routes + DB functions
- All `/api/categories` routes + DB functions
- All `/api/category-budgets` routes + DB functions
- Models: TransactionCreate, TransactionUpdate, TransactionResponse, CategoryCreate, CategoryResponse, CategoryBudgetUpsert, CategoryBudgetResponse, CategorySpend, DashboardStats

**Routes — remove from app.routes.ts:**
- `/transactions` route

**Acceptance criteria:**
- No import errors after deletion
- `ng build` passes
- `pytest` passes (delete any tests for removed features)

---

### Task 2 — DB Migration: DROP old tables + CREATE 5 new tables [x]
Write migration file: `migrations/migrations/20260611000011_feature_rebuild.sql`

**DROP:**
- `budget_categories`
- `category_budgets`
- `transactions`

**CREATE:**
- `accounts` — id UUID PK, household_id UUID FK, name TEXT, type TEXT CHECK('checking','savings','cash'), balance NUMERIC(12,2), currency TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
- `income_entries` — id UUID PK, household_id UUID FK, user_id UUID FK, source TEXT, amount NUMERIC(12,2), frequency TEXT CHECK('monthly','weekly','annual'), created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
- `expenses` — id UUID PK, household_id UUID FK, user_id UUID FK, category TEXT, description TEXT, amount NUMERIC(12,2), date DATE, is_recurring BOOLEAN DEFAULT false, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
- `debts` — id UUID PK, household_id UUID FK, user_id UUID FK, name TEXT, balance NUMERIC(12,2), interest_rate NUMERIC(5,2), minimum_payment NUMERIC(12,2), target_payoff_date DATE nullable, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
- `savings_goals` — id UUID PK, household_id UUID FK, name TEXT, target_amount NUMERIC(12,2), current_amount NUMERIC(12,2) DEFAULT 0, deadline DATE nullable, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ

**RLS on all 5 tables:** household_id must match user's household via household_members.
**Indexes:** on household_id for all tables.
**updated_at triggers** on all tables.

**Acceptance criteria:**
- Migration file created and valid SQL
- All 5 tables created with correct columns and constraints
- RLS policies written

---

### Task 3 — Backend: Pydantic Models [x]
Add to `backend/models.py`:

- AccountCreate, AccountUpdate, AccountResponse
- IncomeCreate, IncomeUpdate, IncomeResponse
- ExpenseCreate, ExpenseUpdate, ExpenseResponse
- DebtCreate, DebtUpdate, DebtResponse
- SavingsGoalCreate, SavingsGoalUpdate, SavingsGoalResponse
- New DashboardStats: total_income, total_expenses, net_position, emergency_fund_status (dict), debt_summary (dict), savings_progress (list)

**Acceptance criteria:**
- All models import cleanly
- Field validation: amounts gt=0, frequency in allowed values, type in allowed values

---

### Task 4 — Backend: DB Functions + Endpoints [x]
Add to `backend/database.py` and `backend/main.py`:

**Endpoints for each resource (accounts, income, expenses, debts, savings_goals):**
- GET /api/{resource} — list all for household
- POST /api/{resource} — create
- PATCH /api/{resource}/{id} — update (household-scoped)
- DELETE /api/{resource}/{id} — delete (household-scoped)

**Rebuild GET /api/dashboard:**
- total_income: sum of monthly-normalised income_entries
- total_expenses: sum of expenses this month
- net_position: total_income - total_expenses
- emergency_fund_status: {current_amount, target_amount, months_covered}
- debt_summary: {total_owed, total_minimum_payments, debt_count}
- savings_progress: list of {goal_name, target_amount, current_amount, percent}

**Acceptance criteria:**
- All endpoints return correct data
- 401 if unauthenticated, 403 if wrong household
- Dashboard aggregates compute correctly

---

### Task 5 — Frontend: Services [x]
Create `frontend/src/app/core/services/money.service.ts` (or domain-split services):

Methods for each resource:
- getAccounts(), createAccount(), updateAccount(), deleteAccount()
- getIncome(), createIncome(), updateIncome(), deleteIncome()
- getExpenses(), createExpense(), updateExpense(), deleteExpense()
- getDebts(), createDebt(), updateDebt(), deleteDebt()
- getSavingsGoals(), createSavingsGoal(), updateSavingsGoal(), deleteSavingsGoal()

Rebuild DashboardService to match new DashboardStats shape.

**Acceptance criteria:**
- All methods return typed Observables
- Auth headers attached via existing pattern (getAccessToken)
- Services providedIn root

---

### Task 6 — Frontend: Home Dashboard Screen [x]
Rebuild `frontend/src/app/dashboard/`

**Layout:**
- Net position card (large, teal if positive, amber if negative)
- Debt summary card: total owed, # debts, total minimum payments
- Emergency fund progress bar: current / target, months covered
- Savings goals list: name, progress bar, percent
- Quick navigation links to all 5 other screens

**Acceptance criteria:**
- Loads real data from GET /api/dashboard
- Shows loading state while fetching
- Empty states for each section when no data
- Matches design system (warm white bg, teal accent, amber caution)

---

### Task 7 — Frontend: Money Plan Screen [x]
New `frontend/src/app/money-plan/money-plan.component.{ts,html,scss}`

**Layout:**
- Income sources section: list with source name + amount + frequency, add button, edit/delete per row
- Expenses section: list with category + description + amount, add button, edit/delete per row
- Monthly summary bar: Total In | Total Out | Surplus/Deficit (teal if surplus, amber if deficit)
- Inline forms for add/edit

**Acceptance criteria:**
- CRUD for income_entries wired to backend
- CRUD for expenses wired to backend
- Monthly totals compute correctly
- Route `/money-plan` registered with auth + household guard

---

### Task 8 — Frontend: Debts Screen [x]
New `frontend/src/app/debts/debts.component.{ts,html,scss}`

**Layout:**
- Header: Total Owed (large), Total Minimum Payments
- Debt cards: name, balance, interest rate %, minimum payment, optional target payoff date
- Progress bar per debt (balance vs original — store original_balance or compute from payments)
- Add debt form / edit inline or modal
- Delete with confirmation

**Acceptance criteria:**
- CRUD for debts wired to backend
- Total owed and total minimum payments computed client-side
- Route `/debts` registered with auth + household guard

---

### Task 9 — Frontend: Emergency Fund Screen [x]
New `frontend/src/app/emergency-fund/emergency-fund.component.{ts,html,scss}`

**Layout:**
- Target card: auto-calculated as 3 months of total monthly expenses (from expenses table), or manually overridden
- Current amount: editable field (backed by a savings_goal named "Emergency Fund")
- Progress bar: current / target
- Months covered indicator (current / monthly_expenses)
- Simple update button to save current amount

**Acceptance criteria:**
- Reads from savings_goals (creates "Emergency Fund" goal on first save if not exists)
- Target auto-calculated from expenses data
- Route `/emergency-fund` registered with auth + household guard

---

### Task 10 — Frontend: Monthly Review Screen [x]
New `frontend/src/app/monthly-review/monthly-review.component.{ts,html,scss}`

**Layout:**
- Month picker (default: current month)
- Summary cards: Total Income, Total Expenses, Net Savings
- vs Plan comparison: actual income vs planned income, actual expenses vs planned expenses
- Simple verdict: on track / over budget (teal / amber)

**Acceptance criteria:**
- Month picker changes the data shown
- Data sourced from expenses (filtered by month) and income_entries
- Route `/monthly-review` registered with auth + household guard

---

### Task 11 — Frontend: Opportunities Screen + Nav [x]
New `frontend/src/app/opportunities/opportunities.component.{ts,html,scss}`

**Layout:**
- Surplus section: shows surplus from Money Plan
- Prioritised suggestions (if surplus > 0):
  1. Top up emergency fund (if below target)
  2. Extra debt payment (highest interest rate first)
  3. Boost savings goal (closest to target first)
- If no surplus: show calm message with link to Money Plan

**Nav update:**
- Update `navigation.component.html` to show all 6 links: Home, Money Plan, Debts, Emergency Fund, Monthly Review, Opportunities
- Remove Transactions link

**Routes:**
- Register `/opportunities` with auth + household guard
- Ensure all 6 routes are in `app.routes.ts`

**Acceptance criteria:**
- Suggestions compute from real data (surplus, debts, savings goals, emergency fund)
- Nav shows all 6 screens on all authenticated pages
- Route `/opportunities` registered with auth + household guard

---

## Phase 2 — Financial Model Conformance  — ⚠️ SUPERSEDED (2026-07-06)

> **SUPERSEDED BY PHASE 3 — INTENTIONAL SPENDING TRACKER (see below).**
> The product has pivoted ~180° away from the generic accounts/expenses/debts/
> savings tracker toward a monthly per-user 50/30/20 "Money Flow" budgeting tool.
> Tasks 12–13 shipped; Tasks 14–19 are **cancelled** and will not be built — the
> `debts` / `debt_payments` / `savings_goals` / `expenses` / `income_entries` /
> `accounts` feature tables they depend on are being retired in Task 20. The
> derived-balance and emergency-fund-snapshot work is preserved here only as a
> historical record. Do not implement Tasks 14–19. Start at Task 20.

The Phase 1 screens are functional, but the underlying financial model has gaps:
debt balances are mutated in place (and can drift), the emergency fund target is
not a deliberate, snapshotted decision, and debt payments are not logged. Phase 2
makes the model conform to the agreed behaviour: a debt-payment log as the source
of truth for balances, a snapshotted emergency-fund target, and a custom
months-based multiplier.

### Task 12 — DB Migration: debt_payments + emergency fund target fields (Size: M) [x]
- **Description**: Add a `debt_payments` confirmation log table and the
  snapshot fields the emergency fund needs. Write migration
  `migrations/migrations/20260616000013_financial_conformance.sql`.
- **Depends on**: None (builds on Phase 1 schema)
- **Files**:
  - `migrations/migrations/20260616000013_financial_conformance.sql`
- **Acceptance criteria**:
  - New table `debt_payments`: id UUID PK, debt_id UUID FK -> debts(id) ON DELETE CASCADE,
    household_id UUID FK, user_id UUID FK, amount NUMERIC(12,2) CHECK > 0,
    paid_for_month DATE (stored as the first day of the month),
    confirmed_at TIMESTAMPTZ DEFAULT NOW(), created_at TIMESTAMPTZ.
  - UNIQUE constraint on `(debt_id, paid_for_month)` to prevent double-counting a
    month's payment.
  - `debts` gains `starting_balance NUMERIC(12,2)` — backfilled to the current
    `balance` value for existing rows so the derived balance is unchanged on day one.
  - `savings_goals` gains emergency-fund snapshot fields:
    `ef_target_basis NUMERIC(12,2)` (the monthly-expense figure captured at snapshot
    time) and `ef_multiplier_months INTEGER` (the number of months used, e.g. 3, 6,
    9, 12). Both nullable; only meaningful for the Emergency Fund goal.
  - RLS policies on `debt_payments` scoped by household via `household_members`.
  - Index on `debt_payments(debt_id)` and `debt_payments(household_id)`.
  - `updated_at` trigger not required for `debt_payments` (append-only log).

### Task 13 — Backend: derive debt balance from the payment log (Size: M) [x]
- **Description**: Make the at-rest/displayed debt balance a derived value:
  `starting_balance − SUM(confirmed debt_payments.amount)`. Stop mutating a stored
  balance that can drift. The payment log is the source of truth.
- **Depends on**: Task 12
- **Files**:
  - `backend/database.py` (`get_debts`, `create_debt`, `update_debt`, dashboard query)
  - `backend/models.py` (`DebtResponse`, `DebtCreate`)
- **Acceptance criteria**:
  - `get_debts` returns each debt with a computed `balance` =
    `starting_balance − COALESCE(SUM(confirmed payments), 0)` (LEFT JOIN / subquery on
    `debt_payments`), never below 0.
  - `create_debt` sets `starting_balance` from the submitted opening balance; the
    initial derived `balance` equals `starting_balance` (no payments yet).
  - `update_debt` no longer allows direct mutation of `balance`; `balance` is dropped
    from `_ALLOWED_DEBT_UPDATE_FIELDS`. Editing a debt updates name, interest_rate,
    minimum_payment (and starting_balance if exposed), not a free-floating balance.
  - The dashboard `debt_summary.total_owed` aggregates the derived balances, not a
    stored column.
  - No separately-mutated balance column is read as the source of truth anywhere.

### Task 14 — Backend: debt payment models + endpoints (Size: M)
- **Description**: Add Pydantic models and endpoints to confirm a debt payment for a
  given month and to list a debt's payment history.
- **Depends on**: Task 12, Task 13
- **Files**:
  - `backend/models.py` (`DebtPaymentCreate`, `DebtPaymentResponse`)
  - `backend/database.py` (`create_debt_payment`, `get_debt_payments`)
  - `backend/main.py` (routes)
- **Acceptance criteria**:
  - `DebtPaymentCreate`: amount gt=0, paid_for_month DATE. The backend normalises
    `paid_for_month` to the first of the month before insert (e.g. 2026-06-16 ->
    2026-06-01).
  - `POST /api/debts/{debt_id}/payments` confirms a payment (household-scoped) and
    returns the updated derived debt balance.
  - A second confirmation for the same `(debt_id, paid_for_month)` is rejected
    (the UNIQUE constraint surfaces as a 409, not a 500) — guards against
    double-counting.
  - `GET /api/debts/{debt_id}/payments` lists confirmed payments for that debt,
    household-scoped, newest first.
  - 401 if unauthenticated, 403/404 if the debt is not in the caller's household.

### Task 15 — Frontend: confirm debt payment + payment history UI (Size: M)
- **Description**: On the Debts screen, let the user confirm a payment for the current
  month and see that the displayed balance drops accordingly (because it is derived
  from the log).
- **Depends on**: Task 14
- **Files**:
  - `frontend/src/app/debts/debts.component.{ts,html,scss}`
  - `frontend/src/app/core/services/money.service.ts` (`confirmDebtPayment`, `getDebtPayments`)
- **Acceptance criteria**:
  - Each debt card has a "Confirm payment" action that posts a payment for the
    current month and refreshes the derived balance.
  - If a payment for the current month is already confirmed, the action is disabled
    and shows a "Paid this month" state instead of erroring.
  - Payment history (amount + month) is viewable per debt.
  - Progress bar reflects `(starting_balance − derived balance) / starting_balance`.

### Task 16 — Backend: emergency fund snapshot model + endpoint (Size: M)
- **Description**: Make the emergency fund target a deliberate, snapshotted value:
  when the user signals "I'm done with expenses", capture the current monthly
  expenses and multiply by a chosen number of months. The target does NOT move on
  its own afterward.
- **Depends on**: Task 12
- **Files**:
  - `backend/models.py` (`EmergencyFundSnapshotRequest`, extend `EmergencyFundStatus`)
  - `backend/database.py` (`snapshot_emergency_fund_target`, dashboard query)
  - `backend/main.py` (route)
- **Acceptance criteria**:
  - `EmergencyFundSnapshotRequest` carries `multiplier_months: int` — the NUMBER OF
    MONTHS to cover (e.g. 3, 6, 9, 12), not a raw target-amount override. Preset
    options plus a custom value are all expressed as a months integer.
  - `POST /api/emergency-fund/snapshot` computes
    `target_amount = current_monthly_expenses × multiplier_months`, then writes
    `target_amount`, `ef_target_basis` (the monthly-expense figure used), and
    `ef_multiplier_months` onto the Emergency Fund savings_goal (creating it if
    absent). This is the only path that changes the target.
  - The target STAYS FIXED after snapshot: subsequent changes to expenses do NOT
    auto-update `target_amount`. Re-snapshotting (calling the endpoint again) is the
    only way to move it.
  - The dashboard reads the stored snapshotted `target_amount` directly; it does not
    recompute the target from live expenses.
  - `EmergencyFundStatus` exposes `target_amount`, `ef_target_basis`,
    `ef_multiplier_months`, and a `target_is_stale` boolean = true when current
    monthly expenses differ from `ef_target_basis` (a hint to re-snapshot), without
    changing the target.

### Task 17 — Frontend: emergency fund snapshot + re-snapshot UI (Size: M)
- **Description**: Rework the Emergency Fund screen so the target is set by an
  explicit "I'm done with expenses" action with a months multiplier, and show a
  re-snapshot prompt when expenses have since changed.
- **Depends on**: Task 16
- **Files**:
  - `frontend/src/app/emergency-fund/emergency-fund.component.{ts,html,scss}`
  - `frontend/src/app/core/services/money.service.ts` (`snapshotEmergencyFund`)
- **Acceptance criteria**:
  - A multiplier control offers preset months (e.g. 3 / 6 months) plus a CUSTOM
    number-of-months input (e.g. 9 or 12). Custom is months, not a target amount.
  - An "I'm done with expenses" button calls the snapshot endpoint with the chosen
    `multiplier_months`; the displayed target updates to
    `monthly_expenses × multiplier_months`.
  - After snapshot, editing expenses elsewhere does NOT change the displayed target.
  - When `target_is_stale` is true, show a calm prompt ("Your expenses have changed —
    re-snapshot your target?") with a button that calls the snapshot endpoint again
    to re-capture the target. The target only moves when the user clicks it.
  - The progress bar uses `current_amount / target_amount`; months-covered uses the
    snapshotted basis where shown.

### Task 18 — Backend: tests for derived balance, payment log, EF snapshot (Size: M)
- **Description**: Add backend tests covering the three conformance behaviours.
- **Depends on**: Task 13, Task 14, Task 16
- **Files**:
  - `backend/tests/test_debt_payments.py`
  - `backend/tests/test_emergency_fund.py`
- **Acceptance criteria**:
  - Test: derived debt balance = starting_balance − sum(confirmed payments); never
    drifts when payments are added/removed.
  - Test: a duplicate `(debt_id, paid_for_month)` payment is rejected with 409.
  - Test: `paid_for_month` is normalised to the first of the month on insert.
  - Test: EF snapshot sets target = monthly_expenses × multiplier_months and stores
    basis + multiplier.
  - Test: changing expenses after snapshot does NOT change the stored target; only a
    re-snapshot does.
  - `pytest` passes.

### Task 19 — Frontend: tests + dashboard reconciliation (Size: S)
- **Description**: Update Phase 1 dashboard/debt/EF specs to the new derived-balance
  and snapshot behaviour, and confirm the dashboard reads the conformant values.
- **Depends on**: Task 15, Task 17
- **Files**:
  - `frontend/src/app/debts/debts.component.spec.ts`
  - `frontend/src/app/emergency-fund/emergency-fund.component.spec.ts`
  - `frontend/src/app/dashboard/dashboard.component.spec.ts`
- **Acceptance criteria**:
  - Debt spec asserts confirming a payment lowers the derived balance and disables a
    second same-month confirmation.
  - EF spec asserts the snapshot action sets the target and that the target is stable
    until re-snapshot.
  - Dashboard spec asserts `total_owed` and emergency-fund target reflect the
    conformant (derived / snapshotted) values.
  - `npm test` passes.

### Risks
- Backfilling `starting_balance` for existing debts must run before any code reads a
  derived balance, or debts briefly show a zero/derived balance mismatch. Do the
  backfill inside the Task 12 migration.
- Switching `balance` from a stored column to a derived value touches the dashboard
  aggregate and any client code that wrote `balance` directly; Task 13 must sweep all
  call sites.
- The UNIQUE `(debt_id, paid_for_month)` constraint must surface as a 409, not an
  unhandled 500 — handle `asyncpg.UniqueViolationError` explicitly in Task 14.

### Open questions
- Emergency fund re-snapshot behaviour — RESOLVED: target stays fixed at establish
  time and never auto-updates; the user must click "I'm done with expenses" again to
  re-snapshot to `monthly_expenses × multiplier`.
- Custom multiplier semantics — RESOLVED: the custom value is a NUMBER OF MONTHS
  (e.g. 9 or 12), so target = monthly_expenses × custom_months — not a raw
  target-amount override.
- Debt balance source of truth — RESOLVED: the `debt_payments` confirmation log is
  the source of truth; the displayed balance is derived as
  `starting_balance − sum(confirmed payments)`, with the UNIQUE
  `(debt_id, paid_for_month)` constraint guarding against double-counting.
- `paid_for_month` granularity — RESOLVED: stored as a first-of-month DATE.

---

## Phase 3 — Intentional Spending Tracker (50/30/20 Money Flow) — ACTIVE PIVOT

### Context
The app is being rebuilt around a **monthly, scoped** budgeting tool — a budget
belongs to either a **user (personal)** or a **household (joint/family)** — based on
Nischa's 50/30/20 "Money Flow" framework (source of truth: the `503020 Rule` tab
of the *Intentional Spending Tracker* workbook + the analysed video transcript).
A user's month has: a **currency** (default `$`), a list of **income streams**
(`{label, amount}`, auto-totalled), and **three buckets** — **Fundamentals (your
needs)** 50%, **Future You (savings & investments)** 20% placed *before* Fun
("pay yourself first"), and **Fun (your wants)** 30% — each with an editable goal
percentage and a free-form list of line items `{label, amount}`. A computed,
colour-flagged dashboard sits at the top.

**v1 scope = the CORE TOOL ONLY**: income streams, three buckets with editable
goal %, line-item CRUD, and the computed colour-flagged dashboard — per month.
Ship this ASAP so the user can start using it.

### What we KEEP (the shell — do not rebuild)
- Auth (register/login/refresh/forgot/reset) — `main.py` lines ~99–222,
  `database.py` user CRUD, `auth.py`, all `auth/` components, guards, interceptor.
- Households (create/join/me/invite-code) + `require_household` dependency — the
  multi-tenant scoping stays and is now load-bearing: a budget is **scoped** to
  either a user (personal, private even inside a family) or a household (joint,
  shared by all members). See Task 20 (schema) and Task 32 (switcher).
- Settings (currency) — `settings/`, `GET/PUT /api/settings`.
- Infra — FastAPI, asyncpg pool (`get_pool`, `_serialize_row`), Neon, Docker,
  Angular 17 standalone shell, `navigation.component`, design tokens.

### What we RETIRE (the old feature layer — replaced by this pivot)
- **Tables** (dropped in Task 20): `accounts`, `income_entries`, `expenses`,
  `debts`, `debt_payments`, `savings_goals`.
- **Backend**: accounts / income / expenses / debts / debt-payments /
  savings-goals endpoints + DB functions + models + the old `DashboardStats`.
- **Frontend**: `dashboard/` (rebuild), `money-plan/`, `debts/`,
  `emergency-fund/`, `opportunities/`, `monthly-review/` components + their
  routes + `money.models.ts` / `money.service.ts` old shapes.
- **Tests**: the corresponding backend `tests/test_*` and frontend `*.spec.ts`.

### Forward-compat seams (architect for, do NOT build now)
- **Monthly/period dimension** — every budget belongs to a `month` (first-of-month
  DATE), unique per owner per scope (partial unique indexes on `(user_id, month)`
  for personal and `(household_id, month)` for household). Historical months and a
  month picker slot in by listing budgets; this is the anchor for everything below.
- **Personal vs household scope** — every budget carries a `scope`
  (`'personal' | 'household'`). v1 ships the schema for **both** and defaults the
  bootstrap to the **household** budget (a solo user is a household-of-one, so it is
  effectively personal for them); the Personal/Household **switcher** is the
  immediate fast-follow (Task 32). Building the column now means **no migration**
  later to add personal budgets alongside a shared household one.
- **Reflections (Phase 4)** — monthly review notes/prompts ("did you overspend / can
  you reduce fundamentals / are you under-living to over-save"). Will attach as a
  `reflections` table FK → `monthly_budgets(id)`. Leave the seam; build nothing now.
- **Later workbook tabs** — Net Worth, Debt Tracker, Goals (progress + time-to-goal),
  Investment Calculator, Risk Profiles. Each becomes its own sibling table + route.
  The generic "period-scoped list of `{label, amount}`" pattern from
  `budget_line_items` is the reuse template.

---

### Task 20 — DB migration: monthly-budget schema + retire old feature tables (Size: M) [x]
- **Description**: Swap the schema. Drop the six retired feature tables and create
  the three core tables for the monthly 50/30/20 tool. Write migration
  `migrations/migrations/20260706000014_intentional_spending_rebuild.sql`.
- **Depends on**: None
- **Files**:
  - `migrations/migrations/20260706000014_intentional_spending_rebuild.sql`
- **Acceptance criteria**:
  - `DROP TABLE IF EXISTS accounts, income_entries, expenses, debt_payments, debts,
    savings_goals CASCADE;` (payments before debts).
  - `monthly_budgets`: `id UUID PK`, `scope TEXT NOT NULL DEFAULT 'household' CHECK
    (scope IN ('personal','household'))`, `user_id UUID NOT NULL REFERENCES users(id)
    ON DELETE CASCADE` (owner when personal; creator otherwise), `household_id UUID
    REFERENCES households(id) ON DELETE CASCADE` (**NOT NULL when scope='household'**,
    enforced by a CHECK: `CHECK (scope = 'personal' OR household_id IS NOT NULL)`),
    `month DATE NOT NULL` (first of month), `currency TEXT NOT NULL DEFAULT '$'`,
    `fundamentals_goal_pct NUMERIC(5,2) NOT NULL DEFAULT 50`, `future_you_goal_pct
    NUMERIC(5,2) NOT NULL DEFAULT 20`, `fun_goal_pct NUMERIC(5,2) NOT NULL DEFAULT
    30`, `created_at`, `updated_at`.
  - **Scope uniqueness** via two partial unique indexes (not a table constraint):
    `CREATE UNIQUE INDEX ... ON monthly_budgets(user_id, month) WHERE scope =
    'personal'` and `CREATE UNIQUE INDEX ... ON monthly_budgets(household_id, month)
    WHERE scope = 'household'`. One personal budget per user per month; one shared
    budget per household per month.
  - `income_streams`: `id UUID PK`, `budget_id UUID NOT NULL REFERENCES
    monthly_budgets(id) ON DELETE CASCADE`, `label TEXT NOT NULL`, `amount
    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0)`, `position INTEGER NOT NULL
    DEFAULT 0`, `created_at`, `updated_at`.
  - `budget_line_items`: `id UUID PK`, `budget_id UUID NOT NULL REFERENCES
    monthly_budgets(id) ON DELETE CASCADE`, `bucket TEXT NOT NULL CHECK (bucket IN
    ('fundamentals','future_you','fun'))`, `label TEXT NOT NULL`, `amount
    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0)`, `position INTEGER NOT NULL
    DEFAULT 0`, `created_at`, `updated_at`.
  - Indexes: `monthly_budgets(user_id, month)`, `monthly_budgets(household_id, month)`,
    `income_streams(budget_id)`, `budget_line_items(budget_id, bucket)`.
  - `updated_at` triggers on all three via the existing `set_updated_at()` function.
  - `ENABLE ROW LEVEL SECURITY` on all three (app-layer scoping, matching the note in
    migration `20260611000011`).
  - **Seam comment** in the file noting a future `reflections` table will FK
    `monthly_budgets(id)`.
- **Applied to Neon main + code-review follow-up (2026-07-06)**: migration
  `20260706000014` is live; a follow-up `20260706000015_budget_integrity_constraints.sql`
  tightens the model (verified live, all behavioural checks pass):
  - `user_id` is **nullable**; ownership is DB-enforced —
    **personal** budget = `user_id` set + `household_id` NULL;
    **household** budget = `household_id` set + `user_id` NULL (household-owned, so
    deleting a member never cascades-away the shared budget).
  - `goal_pct` columns CHECK-bounded 0–100 (no sum-to-100 constraint).
  - `month` CHECK-forced to first-of-month (makes the partial unique indexes real).
  - **Downstream impact**: Task 22 must create household budgets with `user_id = NULL`
    and personal budgets with `household_id = NULL`; Task 21 models reflect this.

### Task 21 — Backend: retire old feature layer + add core Pydantic models (Size: M) [x]
- **Description**: Remove the retired feature code so the app imports against the new
  schema, and add the new request/response models. No new endpoints yet — this slice
  lands a clean-compiling backend with the new model vocabulary.
- **Depends on**: Task 20
- **Files**:
  - `backend/main.py` (delete accounts/income/expenses/debts/debt-payment/
    savings-goals routes + their imports; keep auth, settings, households, dashboard
    stub)
  - `backend/models.py` (delete Account*/Income*/Expense*/Debt*/DebtPayment*/
    SavingsGoal*/old Dashboard* models; add the new models below)
  - `backend/database.py` (delete the retired CRUD + old `get_dashboard_stats` /
    `get_monthly_expenses`; keep user/settings/household helpers, `get_pool`,
    `_serialize_row`)
  - `backend/tests/` (delete tests for retired features:
    `test_endpoints_new_resources.py`, `test_models_new_resources.py`,
    `test_task12_*`, `test_task13_*`, `test_task14_*`, `test_feature_rebuild_migration.py`,
    and any debt/EF tests)
- **New models in `models.py`**:
  - `IncomeStreamCreate {label, amount>=0}`, `IncomeStreamUpdate` (extra="forbid"),
    `IncomeStreamResponse`.
  - `LineItemCreate {bucket: Literal['fundamentals','future_you','fun'], label,
    amount>=0}`, `LineItemUpdate` (extra="forbid"; bucket movable), `LineItemResponse`.
  - `BudgetGoalsUpdate {fundamentals_goal_pct?, future_you_goal_pct?, fun_goal_pct?,
    currency?}` (extra="forbid"; pcts 0–100).
  - `BucketDashboard {bucket, goal_pct, ideal_amount, actual_pct, bucket_total,
    available_to_spend, is_over_flag}` and `BudgetResponse {id, user_id, month,
    currency, goals{...}, total_income, income_streams[], buckets{fundamentals,
    future_you, fun -> line items + BucketDashboard}, allocation_status{state, amount,
    message}}` — the single payload the frontend reads.
- **Acceptance criteria**:
  - `python -c "import main"` succeeds; `pytest` collects with no import errors.
  - No references remain to `accounts` / `income_entries` / `expenses` / `debts` /
    `debt_payments` / `savings_goals` anywhere in `backend/`.
  - New models import cleanly with the validators (label sanitised via
    `_sanitise_text`, amounts `>= 0`, goal pcts 0–100, `LineItem.bucket` constrained).
- **Completed (2026-07-07)**: shipped through all quality phases — TDD (20 model
  tests), code review (Approve, 0 blocking), security scan (0 CRITICAL/HIGH; one LOW,
  currency not sanitised, fixed in-cycle). Two extra hardening fixes landed during
  review/security: whitespace-only label rejection on Create models, and currency
  sanitisation, with 5 added regression tests (test file now 25, all passing). E2E/
  regression introduced zero new failures.
- **Deferred items surfaced during the cycle** (no new formal tasks — folded into
  existing tasks):
  - Dead `require_household` dependency in `main.py` — staged for Task 22.
  - `BudgetResponse` scope invariant enforcement — deferred to Task 22 query layer.
  - Suite hygiene: remove stale "Invoice Me" test cleanup, add real `/api/settings`
    and `/api/dashboard` stub tests — a follow-up to fold into a later test task
    (e.g. Task 31).

### Task 22 — Backend: current-month budget bootstrap (GET, auto-create + seed) (Size: M) [x]
- **Description**: The core read path. `GET /api/budget?month=YYYY-MM-01&scope=household`
  returns the caller's budget for that month + scope, creating it (with default goals
  50/20/30, currency from settings or `$`) on first access and seeding starter line
  items so the screen isn't blank. `scope` defaults to `household` in v1; the value
  `personal` is accepted by the schema/endpoint now so the Task 32 switcher is pure
  frontend + wiring.
- **Depends on**: Task 21
- **Files**:
  - `backend/main.py` (route `GET /api/budget`)
  - `backend/database.py` (`ensure_budget_for_month`, `get_budget`)
- **Acceptance criteria**:
  - `GET /api/budget` with no `month` defaults to the current calendar month
    (first-of-month); an explicit `month` is normalised to first-of-month.
  - First access for a `(scope, owner, month)` creates the `monthly_budgets` row —
    household scope keyed on `(household_id, month)`, personal scope on
    `(user_id, month)` — and seeds default line items (amount 0) — Fundamentals: Rent/Mortgage, Groceries, Insurance,
    Car Payment, Gas/Transportation, Minimum Debt Payments, Phone, Internet,
    Electricity, Miscellaneous; Future You: Emergency Fund, Investment accounts,
    Workplace retirement, Extra debt payments, Downpayment; Fun: Clothing, Eating out,
    Travel, Personal Care, Subscriptions, Donations, Coffees, Miscellaneous. Seeding
    is idempotent (only on create, never re-seeds an existing month).
  - Response is the full `BudgetResponse` (income streams + three buckets with their
    line items). Dashboard/compute fields may be zeroed here — the full compute lands
    in Task 25.
  - Access control by scope: **household** budgets are readable/writable by any member
    of `household_id` (via existing household-membership check); **personal** budgets
    only by their `user_id`. 401 if unauthenticated; 403/404 if the caller is not a
    member (household) or not the owner (personal). `require_household` supplies the
    caller's `household_id` for the default household scope.
- **Completed (2026-07-07)**: shipped through all quality phases — TDD (11 tests
  written Red→Green; final test file has 13, adding 2 for the month-window clamp, all
  passing), code review (Approve, 0 blocking), security scan (0 CRITICAL/HIGH; tenant
  isolation verified structurally sound). Implementation:
  `GET /api/budget?month=&scope=` with scope-branched auth (household →
  membership-checked; personal → owner); `ensure_budget_for_month` (race-safe
  `INSERT ... ON CONFLICT DO NOTHING RETURNING *` + seed in one transaction,
  idempotent) and `get_budget` added to `database.py`; household budgets created with
  `user_id = NULL` / personal with `household_id = NULL` per Task 20. Fixes applied
  in-cycle: compute `total_income` by summing income streams (not hardcoded 0.0);
  removed a dead `get_member_role` round-trip (membership already proven by
  `get_household_by_user`'s JOIN); removed the previously-dead `require_household`; a
  ±12-month clamp on `?month=` (422 outside window, the one MEDIUM finding fixed) to
  prevent auto-create write amplification. The `BudgetResponse` scope invariant is now
  enforced in the handler (closes the Task 21 deferred item). Dashboard compute fields
  + real `allocation_status` remain zeroed, deferred to Task 25. E2E/regression: full
  suite 160 passed / 23 failed — the 23 are the identical pre-existing stale
  "Invoice Me" failures; zero new failures introduced.
- **Deferred items surfaced during the cycle** (no new formal tasks — folded into
  existing tasks):
  - Real-row test coverage for `get_budget` / `_assemble_budget` (bucket assembly,
    income summation, dashboard) → Task 25 (dashboard compute).
  - Minor test gaps: seed-row per-field assertions (amount==0, bucket/label/position),
    past-month clamp case, invalid-scope 422 → a later test-hardening task
    (e.g. Task 31).

### Task 23 — Backend: income-stream CRUD (Size: S) [x]
- **Description**: CRUD for a month's income streams under its budget.
- **Depends on**: Task 22
- **Files**:
  - `backend/main.py` (routes under `/api/budget/{budget_id}/income`)
  - `backend/database.py` (`create_income_stream`, `update_income_stream`,
    `delete_income_stream`; ownership check that the budget belongs to the caller)
- **Acceptance criteria**:
  - `POST /api/budget/{budget_id}/income` creates `{label, amount}`;
    `PATCH .../income/{id}` updates label/amount; `DELETE .../income/{id}` removes it.
  - All operations verify the parent budget belongs to `ctx.user_id`; 403/404 if not.
  - Amounts `>= 0`; label sanitised. Total income is derivable as `SUM(amount)`.
- **Completed (2026-07-08)**: shipped through all quality phases — TDD
  (`test_task23_income_crud.py`, route + DB layers), code review (Approve, 0
  blocking), security scan (0 CRITICAL/HIGH; tenant isolation verified sound),
  E2E (`e2e/specs/smoke/income-api.spec.ts`, 9 API tests pass live). Implementation:
  `POST/PATCH/DELETE /api/budget/{budget_id}/income[/{income_id}]` forwarding the
  auth-context `user_id` (never the path `budget_id`); a single centralised
  `_owned_budget_predicate(alias, budget_param, caller_param)` in `database.py`
  (scope-branched — personal via `user_id`, household via `household_members`
  subquery) reused by `create_income_stream` / `update_income_stream` /
  `delete_income_stream`, each gating ownership **atomically in the same SQL
  statement** (`INSERT…SELECT` / `UPDATE…FROM` / `DELETE…USING … RETURNING`) and
  returning a `None` sentinel → 404 when not owned. Hardening folded in during the
  cycle: `extra="forbid"` on `IncomeStreamCreate` (symmetry with the update model),
  DB-layer tests assert positional `$N` binding (not just SQL substrings), empty
  `{}` PATCH locked as a 200 no-op, and the 404 body asserted to leak no row data.
- **Cross-cutting cleanup (same cycle)**: cleared the 23 pre-existing stale
  "Invoice Me" test failures left over from the pre-pivot invoicing app — deleted
  retired invoice/client/schedule/company-settings model tests, rewrote
  `test_settings.py` to the real `UserSettingsResponse` API (fixing a raw-string
  auth-override bug), and de-flaked a `.env`-polluted CORS config test. Backend
  suite now fully green (184 passed, 0 stale failures).

### Task 24 — Backend: bucket line-item CRUD + goals/currency update (Size: M) [x]
- **Description**: CRUD for bucket line items, plus editing the three goal
  percentages and the currency on the budget.
- **Depends on**: Task 22
- **Files**:
  - `backend/main.py` (routes under `/api/budget/{budget_id}/line-items` and
    `PATCH /api/budget/{budget_id}`)
  - `backend/database.py` (`create_line_item`, `update_line_item`, `delete_line_item`,
    `update_budget_goals`)
- **Acceptance criteria**:
  - `POST /api/budget/{budget_id}/line-items` creates `{bucket, label, amount}`;
    `PATCH .../line-items/{id}` edits label/amount and may move `bucket`;
    `DELETE .../line-items/{id}` removes it.
  - `PATCH /api/budget/{budget_id}` updates `fundamentals_goal_pct`,
    `future_you_goal_pct`, `fun_goal_pct` (each 0–100) and/or `currency`.
  - All operations verify the parent budget belongs to `ctx.user_id`; 403/404 if not.
  - `bucket` constrained to `fundamentals|future_you|fun`; amounts `>= 0`.
- **Completed (2026-07-08)**: shipped through all quality phases — built via TDD (220
  backend tests passing), code review (Approve, 0 blocking), security scan (clean, 0
  CRITICAL/HIGH), and an API E2E flow. Implementation: four endpoints —
  `POST/PATCH/DELETE /api/budget/{budget_id}/line-items[/{id}]` plus
  `PATCH /api/budget/{budget_id}` (goals/currency). Ownership is gated via the shared
  `_owned_budget_predicate` in single SQL statements, returning a `None` sentinel → 404
  when not owned. Hardening folded in during the cycle: `extra="forbid"` added to
  `LineItemCreate`; a bucket-move on PATCH re-tails `position` to the target bucket; and
  `BudgetGoalsUpdate` enforces all-three-or-none goal pcts summing to 100 (with float
  tolerance). **NOT yet committed** — the changes are uncommitted on branch
  `feat/task-23-income-stream-crud`.

### Task 34 — Backend: gated Postgres integration harness proving SQL-level tenant isolation (Size: M) [x]
> **Completed (2026-07-08)**: shipped through all quality phases — TDD (harness + 10 tests,
> teeth proven by a reverted mutation check: 7/10 failed when `_owned_budget_predicate` was
> weakened), code review (Approve, 0 blocking), security scan (clean, 0 CRITICAL/HIGH; one LOW
> squashed by passing DB creds as connect kwargs), and E2E harness validation. Implementation:
> `backend/tests/test_task34_pg_tenant_isolation_integration.py` (single gated module rather than
> the predicted `integration/` dir), using **testcontainers-python** + `postgres:16-alpine`. Applies
> all migrations (deliberately skipping the legacy Supabase-only `20260524000001_households.sql`
> that Neon never ran), reproduces deny-all RLS + a NOSUPERUSER BYPASSRLS app role plus a
> NOBYPASSRLS control role, seeds two tenants via the real `database.py` functions, and asserts
> foreign-tenant INSERT/UPDATE/DELETE mutate ZERO rows at the SQL level. Gated behind
> `RUN_INTEGRATION_TESTS=1`; default suite stays offline (220 passed, 1 skipped, no Docker).
> `_owned_budget_predicate` is byte-for-byte unchanged.
> **Positioned here (after Task 24, before Task 25) for priority, not numbered here.**
> It carries the next available number (34) so the `Depends on` references of the
> existing Tasks 25–33 are not disturbed by a renumber. Prioritised high — it de-risks
> the app's #1 threat — but it is **not** a blocker for Task 25's dashboard compute and
> the two can proceed in parallel.
- **Description**: Tenant isolation is enforced ONLY by SQL-level ownership gating
  (`_owned_budget_predicate` in `backend/database.py`, lines ~432+), because RLS on the
  three budget tables is deny-all and the app connects as a BYPASSRLS role. The entire
  current suite mocks the DB boundary (`database.get_pool` is patched; `DATABASE_URL`
  points at a never-connected localhost), and Task 24's E2E flow proves the ownership
  *contract* in Python via an in-memory double — but NO test proves the production SQL
  `WHERE` clauses actually mutate zero foreign rows against a live Postgres. A fake pool
  cannot establish that guarantee. This task builds a **gated, opt-in** integration
  harness that stands up a real ephemeral Postgres, reproduces the production security
  model faithfully, and asserts the SQL mutates zero foreign-tenant rows.
- **Depends on**: Task 24 (complete) — reuses its income-stream / line-item CRUD
  endpoints and the Task 22 bootstrap as the surface under test. Independent of Task 25.
- **Files**:
  - `backend/tests/integration/test_tenant_isolation_sql.py` (new — the gated suite)
  - `backend/tests/integration/conftest.py` (new — real asyncpg pool fixture, ephemeral
    Postgres lifecycle, migration application, seed helpers)
  - `backend/pytest.ini` (register the `integration` marker; keep it out of the default
    `testpaths`/selection so the fast offline suite is unchanged)
  - `backend/requirements.txt` (or a new `backend/requirements-dev.txt` — add
    `testcontainers` / `pytest` marker deps if that option is chosen)
  - optionally `docker-compose.test.yml` (if a docker-compose test service is the chosen
    Postgres option instead of testcontainers / an ephemeral Neon branch)
  - `backend/tests/integration/README.md` (how to run the gated suite)
- **Acceptance criteria**:
  - A gated integration suite (e.g. `@pytest.mark.integration`, opt-in via an env var
    such as `RUN_INTEGRATION=1`) that does **not** run in the default fast/offline suite;
    a normal `pytest` run neither collects nor requires a live DB.
  - Stands up a real ephemeral Postgres — evaluate testcontainers-python, a
    docker-compose test service, or an ephemeral Neon branch via the Neon MCP — and
    applies every `migrations/migrations/*.sql` in filename order.
  - Faithfully reproduces the production security model: deny-all RLS policies on the
    budget tables AND a BYPASSRLS application role. This fidelity is the crux — if the
    role/RLS setup is not replicated, the test proves nothing.
  - Replaces the mocked `get_pool` with a real asyncpg pool fixture and seeds real data
    (users → monthly_budgets → income_streams / budget_line_items) for two distinct
    tenants.
  - Replays the Task 24 cross-tenant flow and asserts **at the SQL level** that a foreign
    tenant's INSERT / UPDATE / DELETE statements affect **ZERO** rows — verified against
    the DB (e.g. `rowcount == 0` / `RETURNING` yields nothing and the target row is
    unchanged), not merely that the route returns 404.
  - Documentation covering prerequisites and the exact command to run the gated suite.

### Task 25 — Backend: computed colour-flagged dashboard in the budget payload (Size: M)
- **Description**: Make `BudgetResponse` carry the computed dashboard so the client
  renders a single source of truth (reusable later for reflections/snapshots).
- **Depends on**: Task 23, Task 24
- **Files**:
  - `backend/database.py` (`compute_budget_dashboard` folded into `get_budget`)
  - `backend/models.py` (finalise `BucketDashboard`, `allocation_status`)
- **Acceptance criteria**:
  - Per bucket: `ideal_amount = goal_pct/100 × total_income`;
    `actual_pct = bucket_total / total_income` (0 when income is 0);
    `available_to_spend = ideal_amount − bucket_total` (negative = overspent).
  - **Colour flags**: `is_over_flag = true` (RED) when **Fundamentals** or **Fun**
    exceed their goal (`bucket_total > ideal_amount`); for **Future You**,
    `is_over_flag = true` (RED) when it is **UNDER** its goal
    (`bucket_total < ideal_amount`) — reversed logic (under-saving is bad).
  - `allocation_status`: let `allocated = SUM(all bucket line items)`;
    `allocated < total_income` → `state="left", amount=income−allocated,
    message="You have {cur}{amount} left to allocate"`;
    `== income` → `state="balanced", message="Great — all allocated"`;
    `> income` → `state="over", amount=allocated−income, message="Over by
    {cur}{amount}"`.
  - Values recompute on every `GET /api/budget` from live income + line items.

### Task 26 — Frontend: budget models + BudgetService (Size: S)
- **Description**: Replace the old money models/service with typed interfaces and a
  service for the new API.
- **Depends on**: Task 22 (API contract known)
- **Files**:
  - `frontend/src/app/core/models/budget.models.ts` (new: `MonthlyBudget`,
    `IncomeStream`, `LineItem`, `BucketKey`, `BucketDashboard`, `AllocationStatus`,
    `BudgetResponse`)
  - `frontend/src/app/core/services/budget.service.ts` (new: `getBudget(month?)`,
    income CRUD, line-item CRUD, `updateGoals`, `updateCurrency`)
  - delete `frontend/src/app/core/models/money.models.ts` and
    `frontend/src/app/core/services/money.service.ts` (+ their specs)
- **Acceptance criteria**:
  - Methods return typed Observables; auth header attached via the existing
    interceptor pattern; `providedIn: 'root'`.
  - No remaining imports of `money.service` / `money.models` in the app.

### Task 27 — Frontend: retire old feature screens + routes + calm nav (Size: M)
- **Description**: Delete the retired feature components and rewire routing/nav to the
  single Budget screen plus Settings, in the calm grey aesthetic.
- **Depends on**: None (coordinate with Task 26)
- **Files**:
  - delete `frontend/src/app/money-plan/`, `debts/`, `emergency-fund/`,
    `opportunities/`, `monthly-review/` (+ specs)
  - `frontend/src/app/app.routes.ts` (drop those routes; add `/budget`; default
    authenticated redirect → `/budget`)
  - `frontend/src/app/shared/navigation/navigation.component.{html,scss}` (nav = Budget,
    Settings; remove old links; calm grey-toned styling)
  - `frontend/src/app/app.routes.spec.ts` (update)
- **Acceptance criteria**:
  - `ng build` passes with no dangling imports/routes.
  - Nav shows only Budget + Settings; visual tone is calm, grey, minimal.
  - Authenticated users landing on `/dashboard` or a removed route reach `/budget`.

### Task 28 — Frontend: Budget screen — income + three buckets CRUD (Size: L)
- **Description**: The core screen. Income section plus the three buckets
  (Fundamentals / Future You / Fun, in that order) with inline line-item CRUD and
  editable goal % / currency.
- **Depends on**: Task 23, Task 24, Task 26, Task 27
- **Files**:
  - `frontend/src/app/budget/budget.component.{ts,html,scss}` (new)
  - route `/budget` wired with `authGuard, householdGuard`
- **Acceptance criteria**:
  - Income section: list of `{label, amount}` with add/edit/delete per row and a live
    auto-total.
  - Three bucket sections rendered in order **Fundamentals (your needs)** → **Future
    You (savings & investments)** → **Fun (your wants)** — video labels as headings,
    spreadsheet terms as subtitles. Future You appears before Fun.
  - Per bucket: editable goal % control and inline line-item add/edit/delete, each
    wired to the backend and refreshing from `GET /api/budget`.
  - Currency selector (default `$`) persists via `updateCurrency`.
  - Calm grey, minimal styling; tabular numerals for money values.

### Task 29 — Frontend: computed colour-flagged dashboard header (Size: M)
- **Description**: Render the computed per-bucket dashboard at the top of the Budget
  screen from the backend's computed values, with the colour rules and allocation
  status message.
- **Depends on**: Task 25, Task 28
- **Files**:
  - `frontend/src/app/budget/budget.component.{html,scss}` (dashboard header)
  - optionally `frontend/src/app/budget/bucket-summary/` sub-component
- **Acceptance criteria**:
  - Per bucket card shows ideal amount, actual %, and available-to-spend / overspent.
  - RED flag when Fundamentals or Fun are over goal; RED flag when Future You is
    **under** goal (reversed). Calm palette otherwise (grey / muted, amber for
    caution — never harsh).
  - Allocation status message renders the three states ("left to allocate" /
    "all allocated" / "over by X") from `allocation_status`.
  - Updates reactively after any income or line-item edit.

### Task 30 — Settings: currency default `$` wiring (Size: S)
- **Description**: Ensure the currency preference feeds the tool and defaults to `$`.
- **Depends on**: Task 26
- **Files**:
  - `frontend/src/app/settings/components/settings-page/settings-page.component.{ts,html}`
  - `backend/database.py` `upsert_user_settings` (default currency `$` for new users)
- **Acceptance criteria**:
  - New budgets pick up the user's currency (falling back to `$`).
  - Changing currency in Settings is reflected on the Budget screen.

### Task 31 — Tests: backend compute + CRUD, frontend budget screen (Size: M)
- **Description**: Cover the pivot's core behaviours.
- **Depends on**: Task 25, Task 28, Task 29
- **Files**:
  - `backend/tests/test_budget_crud.py`, `backend/tests/test_budget_dashboard.py`
  - `frontend/src/app/budget/budget.component.spec.ts`
  - `frontend/src/app/core/services/budget.service.spec.ts`
- **Acceptance criteria**:
  - Backend: bootstrap creates + seeds once; income/line-item CRUD is user-scoped
    (403/404 cross-user); `ideal_amount`, `actual_pct`, `available_to_spend` compute
    correctly; Future-You under-goal flags RED while Fundamentals/Fun flag RED when
    over; allocation status resolves all three states. `pytest` passes.
  - Frontend: budget screen renders income + three buckets, performs CRUD, and shows
    the colour flags + allocation message. `npm test` passes.

### Task 32 — Personal/Household budget switcher (fast-follow) (Size: M)
- **Description**: The immediate fast-follow after the core tool works. Surface the
  `scope` that v1 already persists: let a user toggle between their **household**
  (joint) budget and a **personal** (private) budget for the same month. Backend is
  already scope-aware from Tasks 20/22 — this is mostly frontend + confirming the
  personal-scope access path.
- **Depends on**: Task 22, Task 28, Task 29 (core tool usable first)
- **Files**:
  - `frontend/src/app/budget/` (a scope segmented control in the header; persist the
    last-used scope; refetch on change)
  - `frontend/src/app/core/services/budget.service.ts` (pass `scope` to `GET/POST`)
  - `backend/main.py` / `backend/database.py` (verify personal-scope create/read and
    the membership vs owner access checks; add tests if gaps)
- **Acceptance criteria**:
  - Header switcher toggles Personal ↔ Household; the screen reloads that scope's
    budget for the current month, auto-creating it on first visit (same bootstrap).
  - A personal budget is invisible to other household members; a household budget is
    shared by all members. Cross-scope/cross-owner access returns 403/404.
  - Goal %, income, and line items are independent per scope. Default view remains the
    household budget; the chosen scope persists across reloads.
  - Solo users (household-of-one) still see a coherent single default; the toggle just
    reveals an optional private budget.

### Task 33 — Choose budget type at signup (Size: S)
- **Description**: After registering, the user picks their **starting** budget —
  **Just Me** (personal scope) or **Household** (create or join, then household scope).
  This only sets which budget bootstraps first; the other can be added later and both
  are kept (Task 32 switches between them). Nothing is one-way.
- **Depends on**: Task 22 (bootstrap), Task 32 (switcher infra)
- **Files**:
  - `frontend/src/app/onboarding/` (a scope-choice step ahead of the existing
    household create/join; "Just Me" skips household setup)
  - `frontend/src/app/core/services/budget.service.ts` (bootstrap the chosen scope)
  - `backend` — persist a lightweight preferred/last-used scope (e.g. on
    `user_settings`) so the app opens the right budget on next login
- **Acceptance criteria**:
  - New user chooses Just Me → lands on a personal budget; chooses Household →
    create/join flow, lands on the shared household budget.
  - The choice is not a lock-in: the switcher (Task 32) still exposes the other scope,
    and building the second budget later keeps the first intact.
  - Next login opens the last-used scope's current-month budget.

### Risks
- Dropping six tables is destructive; this is a pre-launch pivot so acceptable, but
  the migration must run before any code reads the new schema (land Task 20 + Task 21
  together).
- Scoped (personal **or** household) budget keying: every new query must scope by the
  budget's `scope` — household budgets by household membership, personal budgets by
  `user_id`. v1 defaults to household scope; the personal path is exercised fully by
  Task 32. Do not assume a single owner column — always branch on `scope`.
- **SECURITY — ownership is the ONLY tenant-isolation control** (RLS on the three new
  tables is deny-all with no per-row policy; the app connects as a BYPASSRLS role). So
  for Tasks 22–24 and every future budget endpoint this is a hard requirement:
  1. Never trust a client-supplied `budget_id`. Resolve it and verify caller ownership
     **in the same query** before any read/write — e.g. join child-table ops through
     `monthly_budgets` and gate on `(b.user_id = $caller AND scope='personal')` OR
     `(b.household_id = ANY($caller_households) AND scope='household')`.
  2. Centralise the scoping predicate in `database.py` so no endpoint hand-rolls the
     `WHERE` — a single forgotten filter leaks other tenants.
  3. Every budget/income/line-item endpoint gets a negative test: a foreign
     `budget_id` (and a foreign budget row) must return **403/404, never data**.
- The dashboard colour logic is asymmetric (Future You reversed). Encode it once in
  Task 25 and have the frontend render flags, not re-derive them.

### Open questions
- **Currency scope** — stored per-budget (spreadsheet-faithful) but seeded from
  `user_settings.currency`; confirm whether a mid-history currency change should
  rewrite past months (assumed: no — each month keeps its own).
- **Workplace-retirement add-back** — treated as user-driven free-form entry in v1
  (add it as a Future You line item AND as an income stream); no special logic.
  Revisit if the tool should automate the add-back later.
- **Multi-month navigation** — the schema supports it now; a month picker UI is
  deferred (not in v1 core). Confirm v1 ships current-month-only.

---

## Design System Reference
- Background: `#FAFAF7` (warm white)
- Text: `#1C1C1E` (charcoal)
- Accent / Positive: `#0F7168` (teal)
- Caution: `#B45309` (amber — never red)
- Cards: white, 16px radius, subtle shadow
- Font: Inter, tabular numerals for money values

## Tech Stack
- Frontend: Angular 17 standalone components, TypeScript, SCSS
- Backend: Python 3.11, FastAPI 0.109, asyncpg, Pydantic 2.5
- Database: Neon PostgreSQL (connection string in backend/.env)
- Auth: Custom JWT HS256 (issued by FastAPI, stored in localStorage)
- Ports: Frontend 4202, Backend 8002
