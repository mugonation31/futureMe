-- =============================================================================
-- Migration: 20260706000015_budget_integrity_constraints.sql
--
-- Follow-up to 20260706000014_intentional_spending_rebuild. Moves the dual-scope
-- budget model's core invariants from app-only to DB-enforced, and fixes a
-- shared-data-loss hazard in the original ON DELETE CASCADE.
--
-- Changes to monthly_budgets:
--   1. user_id becomes NULLABLE. A HOUSEHOLD budget is owned by the household,
--      NOT by any single user, so it stores NO user_id. This makes the existing
--      `user_id ... ON DELETE CASCADE` correct for BOTH scopes: a personal
--      budget dies with its owner; a household budget (user_id IS NULL) is never
--      touched by a member deleting their account. (Creator attribution, if
--      wanted later, belongs in a separate nullable created_by column with
--      ON DELETE SET NULL.)
--   2. Strict per-scope ownership CHECK replaces the loose household-required one:
--        personal  => user_id set,      household_id NULL
--        household => household_id set,  user_id NULL
--      This also closes the gap where a personal budget could carry a stray
--      household_id (ambiguous ownership, invisible to household queries).
--   3. goal_pct columns bounded to 0..100. No sum-to-100 constraint: the tool
--      deliberately surfaces over/under-allocation vs the 50/30/20 targets.
--   4. month must be the first of its month, so the (owner, month) partial
--      unique indexes actually guarantee one budget per calendar month.
--
-- Safe to add unconditionally: monthly_budgets is empty at this point
-- (pre-launch pivot, created empty in the prior migration).
-- =============================================================================

BEGIN;

-- 1. Household budgets are household-owned; drop the NOT NULL on user_id.
ALTER TABLE monthly_budgets ALTER COLUMN user_id DROP NOT NULL;

-- 2. Strict per-scope ownership. Replaces monthly_budgets_household_required.
ALTER TABLE monthly_budgets
    DROP CONSTRAINT IF EXISTS monthly_budgets_household_required;

ALTER TABLE monthly_budgets
    ADD CONSTRAINT monthly_budgets_scope_ownership CHECK (
        (scope = 'personal'  AND user_id IS NOT NULL AND household_id IS NULL) OR
        (scope = 'household' AND household_id IS NOT NULL AND user_id IS NULL)
    );

-- 3. Goal percentages must be within 0..100 (each independently).
ALTER TABLE monthly_budgets
    ADD CONSTRAINT monthly_budgets_goal_pct_range CHECK (
        fundamentals_goal_pct BETWEEN 0 AND 100 AND
        future_you_goal_pct   BETWEEN 0 AND 100 AND
        fun_goal_pct          BETWEEN 0 AND 100
    );

-- 4. month is always the first of its calendar month.
ALTER TABLE monthly_budgets
    ADD CONSTRAINT monthly_budgets_month_first_of_month CHECK (
        month = date_trunc('month', month)::date
    );

COMMIT;
