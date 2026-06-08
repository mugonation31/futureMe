-- Migration: 20260608000005_seed_categories.sql
-- Seeds 10 default budget categories (household_id = NULL, is_default = true).
-- Idempotent: ON CONFLICT DO NOTHING means safe to re-run.
-- Depends on: 20260608000004_transactions.sql (budget_categories table)

INSERT INTO budget_categories (name, is_default)
VALUES
    ('Groceries',       true),
    ('Rent/Mortgage',   true),
    ('Transport',       true),
    ('Utilities',       true),
    ('Dining Out',      true),
    ('Entertainment',   true),
    ('Healthcare',      true),
    ('Clothing',        true),
    ('Savings',         true),
    ('Income',          true)
ON CONFLICT DO NOTHING;
