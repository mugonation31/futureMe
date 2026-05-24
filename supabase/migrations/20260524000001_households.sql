-- Migration: 20260524000001_households.sql
-- Creates households and household_members tables with RLS,
-- invite_code auto-generation trigger, and all required policies.

-- ============================================================
-- 1. households table
-- ============================================================
CREATE TABLE households (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    invite_code text UNIQUE,
    created_at  timestamptz DEFAULT now(),
    created_by  uuid REFERENCES auth.users
);

-- ============================================================
-- 2. household_members table
-- ============================================================
CREATE TABLE household_members (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    user_id      uuid NOT NULL REFERENCES auth.users,
    role         text NOT NULL CHECK (role IN ('owner', 'member')),
    joined_at    timestamptz DEFAULT now(),
    UNIQUE (household_id, user_id)
);

-- ============================================================
-- 3. invite_code generation
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

CREATE TRIGGER trg_households_invite_code
    BEFORE INSERT ON households
    FOR EACH ROW
    EXECUTE FUNCTION households_set_invite_code();

-- ============================================================
-- 4. Row-Level Security
-- ============================================================
ALTER TABLE households       ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

-- ---- households policies ----

-- SELECT: allowed if the requesting user is a member of this household
CREATE POLICY "households_select"
    ON households
    FOR SELECT
    USING (
        auth.uid() IN (
            SELECT user_id
            FROM   household_members
            WHERE  household_id = households.id
        )
    );

-- INSERT: allowed only by the user who will own the household
CREATE POLICY "households_insert"
    ON households
    FOR INSERT
    WITH CHECK (auth.uid() = created_by);

-- UPDATE: allowed only by an owner-role member of the household
CREATE POLICY "households_update"
    ON households
    FOR UPDATE
    USING (
        auth.uid() IN (
            SELECT user_id
            FROM   household_members
            WHERE  household_id = households.id
              AND  role = 'owner'
        )
    );

-- ---- household_members policies ----

-- SELECT: allowed if the row belongs to the requesting user
--         OR the requesting user is in the same household
CREATE POLICY "household_members_select"
    ON household_members
    FOR SELECT
    USING (
        user_id = auth.uid()
        OR household_id IN (
            SELECT household_id
            FROM   household_members AS hm
            WHERE  hm.user_id = auth.uid()
        )
    );

-- INSERT: users may only insert themselves (user_id must equal auth.uid())
CREATE POLICY "household_members_insert"
    ON household_members
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- DELETE: not allowed in v1 (no policy defined — RLS blocks all deletes by default)
