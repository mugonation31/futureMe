-- Migration: 20260608000001_neon_households.sql
-- Neon-compatible adaptation of 20260524000001_households.sql.
-- External auth FK references and RLS policies removed for Neon compatibility.
-- Requires PostgreSQL 14+ (gen_random_bytes available without pgcrypto extension)

-- ============================================================
-- 0. Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. user_settings table
-- ============================================================
CREATE TABLE IF NOT EXISTS user_settings (
    user_id        uuid NOT NULL PRIMARY KEY,
    display_name   text,
    currency       text,
    monthly_budget numeric(12, 2),
    updated_at     timestamptz DEFAULT now()
);

-- ============================================================
-- 2. households table
-- ============================================================
CREATE TABLE IF NOT EXISTS households (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    invite_code text UNIQUE,
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now(),
    created_by  uuid NOT NULL
);

-- ============================================================
-- 3. household_members table
-- ============================================================
CREATE TABLE IF NOT EXISTS household_members (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    user_id      uuid NOT NULL,
    role         text NOT NULL CHECK (role IN ('owner', 'member')),
    joined_at    timestamptz DEFAULT now(),
    updated_at   timestamptz DEFAULT now(),
    UNIQUE (household_id, user_id)
);

-- ============================================================
-- 4. invite_code generation
-- ============================================================
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN upper(substring(replace(replace(encode(gen_random_bytes(6), 'base64'), '+', ''), '/', ''), 1, 8));
END;
$$;

-- Trigger function that populates invite_code on INSERT when NULL
CREATE OR REPLACE FUNCTION households_set_invite_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.invite_code IS NULL THEN
        NEW.invite_code := generate_invite_code();
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_households_invite_code
    BEFORE INSERT ON households
    FOR EACH ROW
    EXECUTE FUNCTION households_set_invite_code();

-- ============================================================
-- 5. updated_at auto-update triggers
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_households_updated_at
    BEFORE UPDATE ON households
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_household_members_updated_at
    BEFORE UPDATE ON household_members
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
