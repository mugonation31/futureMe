# futureMe — Feature Rebuild Plan

## Context
The app was previously built with the wrong features (generic expense tracker). This plan strips that out and builds the 6 agreed core screens on the solid foundation that exists (auth, household, design system, core services).

## Foundation (complete — do not touch)
- Auth: login, signup, forgot/reset password
- Household: onboarding, invite codes, household guard
- Design system: CSS tokens, nav shell, layout
- Core services: auth, supabase, api
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
Write migration file: `supabase/migrations/20260611000011_feature_rebuild.sql`

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
- Auth: Supabase Auth (credentials in frontend/src/environments/environment.ts)
- Ports: Frontend 4202, Backend 8002
