-- Migration: 20260609000008_category_budgets.sql
-- Creates category_budgets table for per-household monthly spend limits per category.
-- Depends on: 20260608000001_neon_households.sql (households table, set_updated_at function)
--             20260608000004_transactions.sql (budget_categories table)

-- Note: RLS omitted — Neon compatibility issue (see 20260608000001_neon_households.sql).
-- Access is enforced at the application layer via JWT + household_id scoping.

-- ============================================================
-- 1. category_budgets table
-- ============================================================
CREATE TABLE IF NOT EXISTS category_budgets (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    category_id  uuid NOT NULL REFERENCES budget_categories(id) ON DELETE CASCADE,
    monthly_limit numeric(12, 2) NOT NULL CHECK (monthly_limit > 0),
    created_at   timestamptz DEFAULT now(),
    updated_at   timestamptz DEFAULT now(),
    UNIQUE (household_id, category_id)
);

-- ============================================================
-- 2. updated_at trigger on category_budgets
-- ============================================================
CREATE OR REPLACE TRIGGER trg_category_budgets_updated_at
    BEFORE UPDATE ON category_budgets
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 3. Performance index on household_id
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_category_budgets_household_id
    ON category_budgets (household_id);
