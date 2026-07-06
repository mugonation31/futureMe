-- =============================================================================
-- Migration: 20260616000013_financial_conformance.sql
-- Adds debt_payments table and extends debts + savings_goals with new columns.
-- RLS enforced at application layer via household_id checks in FastAPI endpoints
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- CREATE TABLE: debt_payments
-- Immutable payment records — no updated_at column, no update trigger.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS debt_payments (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id   UUID          NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    debt_id        UUID          NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
    user_id        UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    paid_for_month DATE          NOT NULL,
    confirmed_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT debt_payments_unique_debt_month UNIQUE (debt_id, paid_for_month)
);


-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_debt_payments_debt_id
    ON debt_payments (debt_id);

CREATE INDEX IF NOT EXISTS idx_debt_payments_household
    ON debt_payments (household_id);


-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- The application connects as neondb_owner (BYPASSRLS) and enforces household
-- scoping in FastAPI via WHERE household_id = $1 on every query.
-- The policy below is defence-in-depth: it denies all access to any role that
-- does NOT have BYPASSRLS, so a misconfigured connection can never read data.
-- ---------------------------------------------------------------------------

ALTER TABLE debt_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY debt_payments_default_deny ON debt_payments
    AS RESTRICTIVE
    USING (false);


-- ---------------------------------------------------------------------------
-- ALTER TABLE debts — add starting_balance
-- Safe 3-step: add nullable → backfill → lock NOT NULL
-- ---------------------------------------------------------------------------

ALTER TABLE debts ADD COLUMN IF NOT EXISTS starting_balance NUMERIC(12,2);

UPDATE debts SET starting_balance = balance;

ALTER TABLE debts ALTER COLUMN starting_balance SET NOT NULL;


-- ---------------------------------------------------------------------------
-- ALTER TABLE savings_goals — add emergency-fund fields (nullable)
-- ---------------------------------------------------------------------------

ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS ef_target_basis NUMERIC(12,2);

ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS ef_multiplier_months INTEGER;

COMMIT;
