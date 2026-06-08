# Project Lessons

Lessons learned in this project. Reviewed at the start of relevant sessions.

---

## 2026-06-08 — Supabase-to-Neon migration

**What happened:** Migrations written for Supabase Postgres referenced `auth.users` as a foreign key target and used `auth.uid()` in RLS policies. On Neon (plain Postgres) these objects do not exist, causing the migration to fail entirely.
**Why:** Supabase ships its own `auth` schema that is not part of standard Postgres. Any migration that assumes `auth.*` will silently lock the project to Supabase.
**Next time:** When writing migrations, keep a mental checklist of Supabase-isms to strip before running on plain Postgres: `auth.users` FK references, `auth.uid()` in RLS policies, and any `supabase_*` roles. Run a grep for `auth\.` across all migration files before applying to a non-Supabase target.
**Tags:** database, migrations, supabase, neon

---

## 2026-06-08 — Supabase-to-Neon migration

**What happened:** `database.py` referenced a `user_settings` table that was never included in the migration scripts. The mismatch was only caught during code review, not at migration time.
**Why:** Migration scripts were written independently of the application code, so references in `database.py` were not cross-checked against the tables being created.
**Next time:** Before finalising a migration, grep `database.py` (and any other DB access layer files) for every table name and verify each one appears in the migration. Treat this as a required pre-flight step, not an optional review.
**Tags:** database, migrations, code-review, backend

---
