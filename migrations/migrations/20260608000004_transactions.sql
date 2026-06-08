-- Migration: 20260608000004_transactions.sql
-- Creates budget_categories and transactions tables.
-- Depends on: 20260608000001_neon_households.sql (households table, set_updated_at function)

-- ============================================================
-- 1. budget_categories table
-- ============================================================
CREATE TABLE IF NOT EXISTS budget_categories (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id uuid REFERENCES households(id) ON DELETE CASCADE,  -- NULL = global/default category
    name         text NOT NULL,
    icon         text,
    color        text,
    is_default   boolean NOT NULL DEFAULT false,
    created_at   timestamptz DEFAULT now()
);

-- Partial unique index: household-scoped category names must be unique per household
CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_categories_household_name
    ON budget_categories (household_id, name)
    WHERE household_id IS NOT NULL;

-- Partial unique index: global/default category names must be unique across defaults
CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_categories_default_name
    ON budget_categories (name)
    WHERE household_id IS NULL;

-- ============================================================
-- 2. transactions table
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    user_id      uuid NOT NULL,
    category_id  uuid REFERENCES budget_categories(id) ON DELETE SET NULL,
    amount       numeric(12, 2) NOT NULL CHECK (amount > 0),
    type         text NOT NULL CHECK (type IN ('expense', 'income')),
    description  text,
    date         date NOT NULL DEFAULT CURRENT_DATE,
    created_at   timestamptz DEFAULT now(),
    updated_at   timestamptz DEFAULT now()
);

-- ============================================================
-- 3. updated_at trigger on transactions
-- ============================================================
CREATE OR REPLACE TRIGGER trg_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 4. Performance index on transactions
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_transactions_household_date
    ON transactions (household_id, date DESC);
