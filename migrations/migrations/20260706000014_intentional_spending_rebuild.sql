-- =============================================================================
-- Migration: 20260706000014_intentional_spending_rebuild.sql
--
-- Product pivot to an "intentional spending" monthly-budget model.
-- This is a PRE-LAUNCH pivot, so dropping the six retired feature tables
-- destructively is acceptable — there is no production data to preserve.
--
-- Introduces three tables:
--   * monthly_budgets   — a budget scoped to EITHER a user (personal) OR a
--                         household (joint), one per (scope, owner, month).
--   * income_streams    — the income lines that feed a budget.
--   * budget_line_items — planned spend, bucketed into fundamentals / future_you / fun.
--
-- RLS is enabled on all three tables. The application connects to Neon as
-- neondb_owner (BYPASSRLS) and enforces user/household scoping at the
-- application layer (WHERE user_id = $1 / WHERE household_id = $1 on every
-- query), matching the convention documented in 20260611000011_feature_rebuild.
-- Each table additionally carries a RESTRICTIVE default-deny policy for
-- defence-in-depth, matching 20260616000013_financial_conformance — so any
-- role WITHOUT BYPASSRLS can never read a row.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- DROP the six retired feature tables (pre-launch pivot — destructive is OK).
-- debt_payments is dropped before debts to respect the FK order (CASCADE
-- would cover it either way).
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS debt_payments CASCADE;
DROP TABLE IF EXISTS debts         CASCADE;
DROP TABLE IF EXISTS accounts       CASCADE;
DROP TABLE IF EXISTS income_entries CASCADE;
DROP TABLE IF EXISTS expenses       CASCADE;
DROP TABLE IF EXISTS savings_goals  CASCADE;


-- ---------------------------------------------------------------------------
-- CREATE TABLE: monthly_budgets
-- A budget belongs to EITHER a user (scope = 'personal') OR a household
-- (scope = 'household'). user_id is always set (owner when personal, creator
-- otherwise). household_id is nullable at the column level but REQUIRED for
-- household budgets via the CHECK below.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS monthly_budgets (
    id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    scope                 TEXT          NOT NULL DEFAULT 'household'
                              CHECK (scope IN ('personal', 'household')),
    user_id               UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    household_id          UUID          REFERENCES households(id) ON DELETE CASCADE,
    month                 DATE          NOT NULL,
    currency              TEXT          NOT NULL DEFAULT '$',
    fundamentals_goal_pct NUMERIC(5,2)  NOT NULL DEFAULT 50,
    future_you_goal_pct   NUMERIC(5,2)  NOT NULL DEFAULT 20,
    fun_goal_pct          NUMERIC(5,2)  NOT NULL DEFAULT 30,
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
    -- Household budgets must reference a household; personal budgets need not.
    CONSTRAINT monthly_budgets_household_required
        CHECK (scope = 'personal' OR household_id IS NOT NULL)
);

-- Partial unique indexes: one budget per owner per month, per scope.
CREATE UNIQUE INDEX IF NOT EXISTS uq_monthly_budgets_personal
    ON monthly_budgets (user_id, month)
    WHERE scope = 'personal';

CREATE UNIQUE INDEX IF NOT EXISTS uq_monthly_budgets_household
    ON monthly_budgets (household_id, month)
    WHERE scope = 'household';


-- ---------------------------------------------------------------------------
-- CREATE TABLE: income_streams
-- The income lines that feed a budget.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS income_streams (
    id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id  UUID          NOT NULL REFERENCES monthly_budgets(id) ON DELETE CASCADE,
    label      TEXT          NOT NULL,
    amount     NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    position   INTEGER       NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ   NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- CREATE TABLE: budget_line_items
-- Planned spend, bucketed into fundamentals / future_you / fun.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS budget_line_items (
    id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id  UUID          NOT NULL REFERENCES monthly_budgets(id) ON DELETE CASCADE,
    bucket     TEXT          NOT NULL
                   CHECK (bucket IN ('fundamentals', 'future_you', 'fun')),
    label      TEXT          NOT NULL,
    amount     NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    position   INTEGER       NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ   NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_monthly_budgets_user_month
    ON monthly_budgets (user_id, month);

CREATE INDEX IF NOT EXISTS idx_monthly_budgets_household_month
    ON monthly_budgets (household_id, month);

CREATE INDEX IF NOT EXISTS idx_income_streams_budget
    ON income_streams (budget_id);

CREATE INDEX IF NOT EXISTS idx_budget_line_items_budget_bucket
    ON budget_line_items (budget_id, bucket);


-- ---------------------------------------------------------------------------
-- UPDATED_AT TRIGGERS — reuse the existing set_updated_at() function
-- (defined in an earlier migration; do NOT redefine it here).
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_monthly_budgets_updated_at
    BEFORE UPDATE ON monthly_budgets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_income_streams_updated_at
    BEFORE UPDATE ON income_streams
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_budget_line_items_updated_at
    BEFORE UPDATE ON budget_line_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Scoping is enforced at the application layer (FastAPI filters by user_id /
-- household_id). The RESTRICTIVE default-deny policies below are pure
-- defence-in-depth: a role without BYPASSRLS can never read a row, so a
-- misconfigured connection cannot leak data. Matches 20260616000013.
-- ---------------------------------------------------------------------------

ALTER TABLE monthly_budgets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_streams    ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY monthly_budgets_default_deny ON monthly_budgets
    AS RESTRICTIVE
    USING (false);

CREATE POLICY income_streams_default_deny ON income_streams
    AS RESTRICTIVE
    USING (false);

CREATE POLICY budget_line_items_default_deny ON budget_line_items
    AS RESTRICTIVE
    USING (false);


-- ---------------------------------------------------------------------------
-- SEAM (Phase 4): a future `reflections` table will FK monthly_budgets(id)
-- (ON DELETE CASCADE) so each month's budget can carry an end-of-month
-- reflection. Not created here — noted so the schema evolution is intentional.
-- ---------------------------------------------------------------------------

COMMIT;
