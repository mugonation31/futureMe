-- Migration: 20260608000003_users.sql
-- Custom auth: add users table, fix user_settings schema

-- ============================================================
-- 1. users table (replaces Supabase auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text UNIQUE NOT NULL,
    password_hash text NOT NULL,
    display_name  text,
    created_at    timestamptz DEFAULT now(),
    updated_at    timestamptz DEFAULT now()
);

CREATE OR REPLACE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 2. Fix user_settings: add created_at column if missing
-- ============================================================
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
