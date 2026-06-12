-- Patch migration: fix constraints missed in 20260611000011_feature_rebuild
-- Applied after tables were created — uses ALTER TABLE to add missing constraints.
--
-- RLS NOTE: Row Level Security is enabled on all 5 tables (accounts, income_entries,
-- expenses, debts, savings_goals) but NO policies are defined. This is intentional.
-- This project connects to Neon as neondb_owner which has BYPASSRLS, so DB-level
-- policies are not the enforcement mechanism. Household scoping is enforced at the
-- application layer: all FastAPI endpoints filter by household_id derived from the
-- authenticated user's household_members record. See migrations 000009 and 000010
-- for the same pattern on earlier tables.

-- Fix interest_rate column precision
-- Stored as a percentage value (e.g. 15.5 means 15.5% APR)
ALTER TABLE debts ALTER COLUMN interest_rate TYPE NUMERIC(6,2);
ALTER TABLE debts ADD CONSTRAINT debts_interest_rate_max CHECK (interest_rate <= 100);

-- Prevent phantom zero-value debt records
ALTER TABLE debts ADD CONSTRAINT debts_meaningful CHECK (balance > 0 OR minimum_payment > 0);

-- Prevent savings goal current_amount exceeding target
ALTER TABLE savings_goals ADD CONSTRAINT savings_goals_current_lte_target CHECK (current_amount <= target_amount);

-- Bound expenses category to reasonable length (free text, user-defined)
ALTER TABLE expenses ADD CONSTRAINT expenses_category_length CHECK (char_length(category) <= 100);
