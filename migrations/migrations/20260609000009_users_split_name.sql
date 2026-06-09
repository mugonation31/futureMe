-- Migration: 20260609000009_users_split_name.sql
-- Add first_name and last_name columns to users table

ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name text;
