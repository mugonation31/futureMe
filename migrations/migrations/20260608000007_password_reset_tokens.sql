-- Migration: 20260608000007_password_reset_tokens.sql
-- Creates password_reset_tokens table for secure password reset flows.
-- Depends on: 20260608000003_users.sql (users table)

-- ============================================================
-- 1. password_reset_tokens table
-- ============================================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  text UNIQUE NOT NULL,
    expires_at  timestamptz NOT NULL,
    used_at     timestamptz,
    created_at  timestamptz DEFAULT now()
);

-- ============================================================
-- 2. Index on expires_at for efficient expired-token cleanup
-- (token_hash lookup is covered by the UNIQUE constraint's implicit index)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at
    ON password_reset_tokens (expires_at);
