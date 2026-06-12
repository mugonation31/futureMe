-- =============================================================================
-- Migration: 20260611000011_feature_rebuild.sql
-- Drops legacy budget/transaction tables and rebuilds core feature tables.
-- RLS enforced at application layer via household_id checks in FastAPI endpoints
-- =============================================================================


-- ---------------------------------------------------------------------------
-- DROP legacy tables (cascade removes dependent FK constraints and indexes)
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS budget_categories CASCADE;
DROP TABLE IF EXISTS category_budgets CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;


-- ---------------------------------------------------------------------------
-- CREATE TABLE: accounts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS accounts (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID          NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    name         TEXT          NOT NULL,
    type         TEXT          NOT NULL CHECK (type IN ('checking', 'savings', 'investment', 'other')),
    balance      NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- CREATE TABLE: income_entries
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS income_entries (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID          NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    source       TEXT          NOT NULL,
    amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    frequency    TEXT          NOT NULL CHECK (frequency IN ('weekly', 'fortnightly', 'monthly', 'annually')),
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- CREATE TABLE: expenses
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS expenses (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID          NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    name         TEXT          NOT NULL,
    category     TEXT          NOT NULL,
    amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    date         DATE          NOT NULL,
    is_recurring BOOLEAN       NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- CREATE TABLE: debts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS debts (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id    UUID          NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    name            TEXT          NOT NULL,
    balance         NUMERIC(12,2) NOT NULL CHECK (balance >= 0),
    interest_rate   NUMERIC(6,2)  NOT NULL CHECK (interest_rate >= 0),
    minimum_payment NUMERIC(12,2) NOT NULL CHECK (minimum_payment >= 0),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- CREATE TABLE: savings_goals
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS savings_goals (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id   UUID          NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    name           TEXT          NOT NULL,
    target_amount  NUMERIC(12,2) NOT NULL CHECK (target_amount > 0),
    current_amount NUMERIC(12,2) NOT NULL CHECK (current_amount >= 0) DEFAULT 0.00,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_accounts_household
    ON accounts (household_id);

CREATE INDEX IF NOT EXISTS idx_income_entries_household
    ON income_entries (household_id);

CREATE INDEX IF NOT EXISTS idx_expenses_household
    ON expenses (household_id);

CREATE INDEX IF NOT EXISTS idx_expenses_date
    ON expenses (household_id, date);

CREATE INDEX IF NOT EXISTS idx_debts_household
    ON debts (household_id);

CREATE INDEX IF NOT EXISTS idx_savings_goals_household
    ON savings_goals (household_id);


-- ---------------------------------------------------------------------------
-- UPDATED_AT TRIGGERS — reuse existing set_updated_at() function
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_income_entries_updated_at
    BEFORE UPDATE ON income_entries
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_debts_updated_at
    BEFORE UPDATE ON debts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_savings_goals_updated_at
    BEFORE UPDATE ON savings_goals
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- RLS enforced at application layer via household_id checks in FastAPI endpoints
--
-- RLS NOTE: Row Level Security is enabled on all 5 tables (accounts, income_entries,
-- expenses, debts, savings_goals) but NO policies are defined. This is intentional.
-- This project connects to Neon as neondb_owner which has BYPASSRLS, so DB-level
-- policies are not the enforcement mechanism. Household scoping is enforced at the
-- application layer: all FastAPI endpoints filter by household_id derived from the
-- authenticated user's household_members record. See migrations 000009 and 000010
-- for the same pattern on earlier tables.
-- ---------------------------------------------------------------------------

ALTER TABLE accounts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE debts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_goals  ENABLE ROW LEVEL SECURITY;
