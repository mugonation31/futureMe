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

## 2026-06-08 — Tasks 21–23: transaction/category backend (TDD agent prompts, SQL safety, query param validation)

**What happened:** A vague TDD agent prompt ("implement tasks 21-23") caused the agent to write tests for the wrong feature (households) and declare success without writing new code. A second prompt that listed exact function signatures, file names, and a numbered test list succeeded on the first run.
**Why:** Without precise scope, the agent pattern-matched on recent context (households) rather than the intended feature (transactions). Specificity is the only reliable countermeasure.
**Next time:** TDD agent prompts for this project must include: the exact function names to implement, the file each belongs to, and a numbered list of test cases. "Implement task N" is never sufficient — always expand to function-level detail.
**Tags:** testing, tdd, agents, process

---

**What happened:** The `update_transaction` DB function used `model_dump(exclude_unset=True)` to build a dynamic SET clause without an allowlist. This is safe today because Pydantic field names match column names, but schema drift or a future computed field could silently introduce identifier injection.
**Why:** It is easy to treat Pydantic-sourced keys as inherently safe. They are safe against user-supplied injection, but not against schema drift or accidental field additions.
**Next time:** Any dynamic SQL SET-clause builder in `database.py` must declare `_ALLOWED_FIELDS = {frozenset of column names}` before the loop and skip any key not in the set. This costs two lines and eliminates the class of bug permanently.
**Tags:** security, database, sql, backend

---

**What happened:** The `month` query param (`?month=YYYY-MM`) was accepted as a raw, unvalidated string. A garbage value caused Postgres to throw a 500 instead of a clean 422.
**Why:** FastAPI does not validate string query params unless a pattern or type constraint is declared. The validation gap was only visible at the DB layer, which surfaces it as a server error rather than a client error.
**Next time:** Any query param that is passed into a SQL statement must be validated at the FastAPI layer. For `month`: `Query(None, pattern=r"^\d{4}-\d{2}$")`. This returns 422 before the DB call is made.
**Tags:** api, validation, fastapi, backend

---

**What happened:** Deferred security items (JWT lifetime, refresh tokens, password complexity, CategoryCreate color validation, CORS restrictions) were noted during the dev cycle but not added to PLAN.md, leaving them untracked and at risk of being forgotten permanently.
**Why:** Security deferrals feel low-priority in the moment and get noted in discussion but never written down as tasks.
**Next time:** Any security item that is explicitly deferred ("we will fix this later") must be added to PLAN.md as a task before the end of the dev cycle. If it is not in PLAN.md it does not exist.
**Tags:** security, process, planning, workflow

---

## 2026-06-08 — Replacing Supabase Auth with custom auth (users table + bcrypt + HS256 JWT)

**What happened:** Moving from Supabase Auth to a self-hosted Neon Postgres required a full custom auth implementation: a `users` table (uuid PK, email, password_hash, display_name), bcrypt hashing via `passlib[bcrypt]`, and HS256 JWT signing with `pyjwt`. The config field also changed from `SUPABASE_JWT_SECRET` to `JWT_SECRET`, which silently invalidates any previously issued tokens and breaks the frontend Angular `AuthService` if it expects a different payload shape.
**Why:** Supabase Auth is a separate service — removing it means the backend must take over every responsibility it provided: credential storage, password hashing, token issuance, and token verification. None of this is wired automatically.
**Next time:** When migrating off Supabase Auth on this project, the full checklist is: (1) add `users` migration with bcrypt-ready `password_hash` column; (2) add `create_user` / `get_user_by_email` / `verify_password` to `database.py`; (3) add `_create_access_token` helper to `main.py` with `sub`, `email`, `display_name`, `exp` claims; (4) update `config.py` to replace `supabase_jwt_secret` with `jwt_secret`; (5) update Angular `AuthService` to decode the new payload shape; (6) clear `localStorage` tokens in the browser — old Supabase tokens will fail verification immediately.
**Tags:** auth, database, migrations, backend

---

## 2026-06-08 — Transaction PATCH/DELETE: fetch record first, then check creator-vs-owner-role

**What happened:** The PATCH and DELETE endpoints for transactions use a two-step authorization pattern: fetch the record scoped to `household_id`, return 404 if absent, then check if the requester is the creator (`user_id` match). If not, fetch the requester's household role and allow only if `role == 'owner'`. Skipping the fetch-first step makes it impossible to distinguish "record not found" from "record exists but you can't touch it", leaking existence information.
**Why:** The household scoping (`WHERE household_id = $1`) already prevents cross-household reads, but within a household a member can see all transactions while only being allowed to mutate their own. Without the creator check, any household member could edit or delete any other member's transaction.
**Next time:** For any resource that is scoped to a group (household) but owned by an individual (user_id), follow this pattern exactly: `get_<resource>(household_id, resource_id)` → 404 if missing → compare `existing["user_id"] == context.user_id` → if mismatch, fetch role → 403 if not owner. Do not skip the fetch or combine the 404/403 checks.
**Tags:** auth, api, backend, security

---

## 2026-06-08 — Task 38: DB migration for `password_reset_tokens` table

**What happened:** The migration added a UNIQUE constraint on `token_hash` and then immediately added a separate `CREATE INDEX` on the same column. The index was completely redundant — PostgreSQL automatically creates a B-tree index to enforce every UNIQUE constraint.
**Why:** It is easy to write the index by habit without remembering that UNIQUE already implies one. The duplicate does not cause a failure but doubles write overhead on every insert/update to that column.
**Next time:** When writing a migration, do not add a `CREATE INDEX` for any column that already has a `UNIQUE` constraint (or `PRIMARY KEY`). As a quick check: if the column appears in a `UNIQUE` or `PRIMARY KEY` clause, the index is already there.
**Tags:** database, migrations, postgres, performance

---

**What happened:** Migration tests used the loose assertion pattern `"keyword" in sql and "table_name" in sql` to verify schema structure. These two substring checks can be satisfied by completely unrelated parts of the SQL file, producing false-positive test results.
**Why:** It feels intuitive to check that both words appear somewhere in the file, but SQL files contain many keywords and table names across multiple statements — the two checks are almost never coupled.
**Next time:** Always use `re.search` with a pattern that captures the actual SQL structure, e.g. `re.search(r"UNIQUE\s*\(\s*token_hash\s*\)", sql, re.IGNORECASE)`. The pattern must require both tokens to appear in the right relationship, not just somewhere in the file.
**Tags:** testing, database, migrations, assertions

---

## 2026-06-08 — Task 39: password reset flow (async SDK, TOCTOU, purpose-claim, anti-enumeration, config defaults)

**What happened:** The Resend SDK ships both `resend.Emails.send` (sync) and `resend.Emails.send_async`. The sync variant was used inside an `async def` endpoint, blocking the entire FastAPI event loop for the full HTTP round-trip.
**Why:** It is easy to assume that a method called from an async function is safe — the SDK doesn't raise, it just blocks. The async variant requires explicitly choosing the `_async` method name.
**Next time:** Before calling any third-party SDK method from an `async def`, check whether an async variant exists. For Resend in this project: always use `resend.Emails.send_async(...)`. Search for `send(` in `email_service.py` whenever the Resend version is bumped.
**Tags:** async, email, backend, fastapi

---

**What happened:** The password-reset handler issued two separate awaited DB calls — update the password, then invalidate the token. A crash between the two would leave the token valid against the new password.
**Why:** The two writes were written sequentially without wrapping them in a transaction, so they were not atomic.
**Next time:** Any pair of writes that must both succeed or both fail for security correctness must be wrapped in a single `async with conn.transaction():` block in `database.py`. This applies especially to: reset-token invalidation + credential update, and any other security-critical multi-step write.
**Tags:** database, security, backend, auth

---

**What happened:** A password-reset JWT signed with the same secret as session tokens passed `jwt.decode()` unchanged and was accepted as a valid session credential, because `verify_token` did not check the `purpose` claim.
**Why:** The signature check only proves the token was signed by us — it does not prove the token is being used in the correct context. A non-null `purpose` claim is invisible to a decoder that only checks the signature and expiry.
**Next time:** `verify_token` in `auth.py` must explicitly reject any token whose decoded payload contains a `purpose` key (or assert `purpose is None`). Add this check immediately after `jwt.decode()`. Any token intended for a specific flow (password reset, email verify, invite) must be validated only in its dedicated endpoint and rejected everywhere else.
**Tags:** auth, security, jwt, backend

---

**What happened:** The forgot-password endpoint swallowed exceptions only in the "user not found" branch. Any uncaught exception in the "user exists" branch (Resend API down, DB write fails) escaped as a 500, creating a side-channel: registered emails returned 500, unknown emails returned 200.
**Why:** Anti-enumeration was applied to the response status code, not to the entire code path. Exception handling was not part of the security model.
**Next time:** The forgot-password endpoint must wrap the entire "user exists" block — including the DB token write and the Resend call — in a `try/except Exception`. Log the error internally, swallow it externally, and always return 200 with the same body. The invariant is: no observable difference between a registered and an unregistered email, including error states.
**Tags:** security, auth, api, anti-enumeration

---

**What happened:** `config.py` had `resend_api_key: str = "placeholder"`. The app started cleanly with no Resend key configured, silently failing to send any email at runtime.
**Why:** A placeholder default was added so the app could start without a `.env` file during development. The cost was that missing-key failures became invisible until the feature was exercised at runtime.
**Next time:** Required integration keys (`resend_api_key`, `jwt_secret`, `database_url`) must have no default — `resend_api_key: str` with no `= ...`. Pydantic will raise `ValidationError` at startup if the env var is absent, surfacing the problem at boot time rather than silently at the point of use.
**Tags:** config, backend, reliability, security

---

## 2026-06-08 — Task 40: anti-enumeration, TDD refactor coverage, TestBed isolation, E2E selectors

**What happened:** The forgot-password and reset-password Angular components used `err.error?.detail` to display error messages — directly reflecting the API response body. This defeats the backend's anti-enumeration design: the server always returns the same response, but the frontend surfaced the real server state to the user.
**Why:** Anti-enumeration was treated as a backend responsibility. Frontend error handlers defaulted to "use what the API returns", which is the normal pattern for non-security endpoints — but is exactly wrong for auth enumeration-sensitive flows.
**Next time:** Auth error handlers (forgot-password, reset-password, login) must use hardcoded strings only. Never use `err.error?.detail` or any server response body in these components. For reset-password, map solely on status code: `err.status === 400 ? 'Link invalid or expired' : 'Something went wrong'`. Review all auth component error handlers as a checklist item when implementing the frontend of any auth flow.
**Tags:** security, auth, anti-enumeration, frontend

---

**What happened:** A TDD refactor of the login component spec replaced all core behaviour tests (navigate-to-dashboard, navigate-to-onboarding, show-error-on-failure) with CSS class assertions. The spec looked green and complete but covered a smaller, lower-value surface than before.
**Why:** When a spec is touched as part of a feature implementation, it is natural to restructure it for the new feature — but easy to accidentally remove coverage for the original flows while doing so.
**Next time:** Whenever a spec file is modified as part of a new feature, count the test cases before and after and verify the existing flows (navigation, error display, service call assertions) are still present. CSS class assertions are lower value than behaviour assertions and must not replace them.
**Tags:** testing, tdd, coverage, angular

---

**What happened:** A test called `TestBed.resetTestingModule()` inside an `it()` block to reconfigure providers (different query params). This caused subsequent tests in the same suite to inherit contaminated module state, producing failures that were hard to diagnose.
**Why:** `resetTestingModule()` is designed for use in `afterEach` cleanup, not mid-test reconfiguration. Calling it inside `it()` tears down the module mid-suite, affecting everything that runs after it in Karma.
**Next time:** Never call `TestBed.resetTestingModule()` inside an `it()` block. Tests that require a different provider configuration (e.g. a route with different query params) must be in their own `describe` block with their own `beforeEach` and `TestBed.configureTestingModule` call.
**Tags:** testing, angular, karma, test-isolation

---

**What happened:** Three E2E selectors in a page object written before the component existed were wrong when the component was finally built — the card class, the heading text, and the token-error div class all differed from the stubs used as placeholders.
**Why:** Page objects are often written from a spec or design doc, not from rendered HTML. Placeholder selectors feel complete but are guesses until the actual component exists.
**Next time:** Before un-skipping any E2E test that was written against a pre-existing stub, read the actual rendered HTML and verify every locator in the page object — class names, text strings, ARIA roles — against the live component. Do not trust any selector that was written before the component existed.
**Tags:** e2e, playwright, page-objects, selectors

---

## 2026-06-09 — Currency pipe: pure pipe + async internal state = stale first render

**What happened:** A `CurrencyPipe` fetched user settings asynchronously in its constructor and stored the currency code in a class field. On first render, the field was still `null`, so the pipe fell back to a default currency. Angular never re-invoked `transform()` after the subscription resolved because the pipe's input hadn't changed.
**Why:** `pure: true` (the default) means Angular only re-runs `transform()` when the pipe's *input reference* changes. A mutation to an internal class field is invisible to Angular's change detection. The async fetch completed too late.
**Next time:** Never rely on async internal state inside a pure pipe. The correct fix is a route resolver that fetches settings before the component activates — settings are then synchronously available when `transform()` first runs. Do not switch to `pure: false` as a workaround — it runs on every change detection cycle and is an anti-pattern.
**Tags:** angular, pipes, async, settings

---

## 2026-06-09 — shareReplay(1) + null-invalidation for service-level caching

**What happened:** `SettingsService.getSettings()` was called by multiple consumers (a pipe, multiple components) on the same page. Each call triggered a separate HTTP request because the service returned a new observable each time.
**Why:** Without caching, the same endpoint is hit once per subscriber. With `shareReplay(1)`, the first subscriber triggers the request; all subsequent subscribers receive the cached value immediately.
**Next time:** For any service method that is called by more than one consumer and returns stable data: (1) store the observable as a class field; (2) add `shareReplay(1)`; (3) in the corresponding mutation method (`updateSettings()`), set the cached field to `null` so the next `getSettings()` call re-fetches. This eliminates N simultaneous HTTP calls at zero cost to callers.
**Tags:** angular, rxjs, performance, caching

---

## 2026-06-09 — Empty-string filter required in null-guard PATCH patterns

**What happened:** A PATCH handler filtered form values with `v !== null && v !== undefined` before building the request body. Empty strings passed the check and overwrote existing DB values.
**Why:** `'' !== null` is `true`. The intent of the guard was "only send fields the user actually changed," but an empty string is a real, typed value that the user may have cleared — or may have left blank because the field was never touched. Without filtering `''`, cleared but never-focused inputs silently overwrite persisted data.
**Next time:** The correct filter for "omit untouched fields before a PATCH" is `v !== null && v !== undefined && v !== ''`. Apply this to every object spread/reduce that constructs a partial update body. If an empty string is a valid intentional value for a field, filter on `v !== null && v !== undefined` only and document that choice explicitly.
**Tags:** angular, forms, api, data-integrity

---

## 2026-06-09 — Dead auth guard branches are a security maintenance risk

**What happened:** A route guard contained `if (state.url === '/onboarding') return true` — a branch that was never reachable because that guard was never applied to the `/onboarding` route. The branch was harmless today but created a risk: a future route-config change could accidentally make it reachable, silently bypassing auth for onboarding.
**Why:** Dead branches accumulate when guards evolve. The original condition was meaningful when written but became unreachable after a route config change. No one removed it because it did not cause a visible failure.
**Next time:** When reviewing or modifying a route guard, check every conditional branch against the actual route config. If a branch can never be entered (because the guard is never applied to the url it tests), remove it immediately. Treat dead guard branches as bugs, not dead code.
**Tags:** angular, routing, security, guards

---

## 2026-06-09 — takeUntilDestroyed() is required for constructor-level subscriptions in pipes

**What happened:** A standalone pipe subscribed to a settings observable in its constructor. Without `takeUntilDestroyed(this.destroyRef)`, the subscription remained active after the component using the pipe was destroyed. If the observable emitted after destruction, the pipe tried to update a destroyed view.
**Why:** Pipes are instantiated per component by Angular's DI system. A constructor subscription in a pipe has the same lifecycle as a component subscription — it must be cleaned up when the view is torn down. The pipe's class structure makes this easy to miss because pipes feel more like stateless functions than stateful components.
**Next time:** Any pipe that creates a subscription in its constructor must inject `DestroyRef` and attach `takeUntilDestroyed(this.destroyRef)` to the observable. The pattern: `constructor(private destroyRef: DestroyRef) { service.getData().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(...) }`.
**Tags:** angular, rxjs, pipes, memory-leaks

---

## 2026-06-08 — TS4114: `noImplicitOverride` is enabled and applies to E2E page objects

**What happened:** Page-object subclasses (`LoginPage`, `SignupPage`) defined a `goto()` method that overrides `BasePage.goto()` without the `override` keyword. The TypeScript compiler emitted TS4114 ("This member must have an 'override' modifier because it overrides a member in the base class 'BasePage'"). The error only surfaced when the page objects were compiled together, not during initial authoring.
**Why:** `tsconfig.json` has `"noImplicitOverride": true`. This flag is not part of the default `"strict": true` bundle — it is a separate, less commonly known option that was explicitly added. Developers writing subclasses by hand often omit `override` because most TypeScript projects don't require it.
**Next time:** When adding any method to an E2E page-object class that extends `BasePage`, check whether the method name matches any method on `BasePage` and if so, prefix it with `override`. Run `tsc --noEmit` from `frontend/` to catch TS4114 errors before committing.
**Tags:** typescript, e2e, testing, page-objects

---

## 2026-06-09 — SEC-1: JWT refresh token — Angular interceptor, token storage, and bootstrap cleanup

**What happened:** Four blocking defects were found during code review: (1) the 401-retry interceptor did not skip the `/auth/refresh` URL itself — a 401 from the refresh endpoint looped back through the interceptor indefinitely; (2) the interceptor wrote tokens directly to `localStorage` by key string, bypassing `AuthService`'s BehaviorSubject and leaving `currentUser$` permanently stale; (3) `refreshAccessToken()` did not guard against a missing refresh token — `localStorage.getItem()` returns `null`, and posting `{ refresh_token: null }` reaches the server as the literal string `"null"`, causing a 401 that re-triggered the interceptor; (4) `loadUserFromToken()` cleared an expired access token on bootstrap but left the refresh token, silently re-authenticating the user on the first subsequent 401.
**Why:** Each defect was an incomplete scope in one direction: the interceptor covered the happy path but not its own error path; direct `localStorage` writes saved a method call but broke the reactive layer; the null guard was skipped as "unlikely"; bootstrap cleanup was written for one token only.
**Next time:** For the refresh-token interceptor in this project, the mandatory checklist is: (1) add `if (req.url.includes('/auth/refresh')) return next(req)` as the very first line; (2) call `this.authService.storeAccessToken(token)` — never write `localStorage` directly in an interceptor; (3) read the refresh token at the top of `refreshAccessToken()` and `throwError(...)` immediately if null; (4) in `loadUserFromToken()`, call `this.authService.logout()` when the access token is invalid — always clear both tokens together.
**Tags:** auth, angular, interceptor, security

---

## 2026-06-09 — SEC-1: refresh token storage — localStorage tradeoff and the correct long-term posture

**What happened:** The SEC-1 implementation stored the refresh token in `localStorage`. A security scan confirmed this is the standard tradeoff when the access token is also in `localStorage`, but identified the correct long-term posture: access token in memory only (never persisted), refresh token in an `HttpOnly; Secure; SameSite=Strict` cookie, Angular `HttpClient` configured with `withCredentials: true`.
**Why:** `localStorage` is accessible to any JavaScript in the same origin, including XSS payloads. A 7-day refresh token in `localStorage` gives an attacker a 7-day window after a single XSS. An `HttpOnly` cookie eliminates the JavaScript-access surface entirely.
**Next time:** When revisiting token storage in this project: (1) access token moves to a BehaviorSubject field in `AuthService` — never written to `localStorage`; (2) refresh token is set as `HttpOnly; Secure; SameSite=Strict` via `Set-Cookie` in the FastAPI login/refresh response; (3) `withCredentials: true` is added to all `HttpClient` calls that need the cookie. Track this as a dedicated security task in PLAN.md — it is a coordinated frontend + backend breaking change.
**Tags:** security, auth, jwt, frontend

---

## 2026-06-09 — SEC-2: password complexity validation + show/hide toggle

**What happened:** The `passwordsValid` getter in the reset-password component only checked `length >= 6` and matching passwords. A weak password like `abcabc` satisfied both conditions, enabled the submit button, hit the backend, received a 422, and surfaced to the user as the generic "Something went wrong." The fix required adding `hasDigit()` and `hasSpecialChar()` to the component and including both in the getter.
**Why:** The getter logic and the password-rules hint list were implemented separately — the hint list methods were added to signup but the getter was written independently. The gap was invisible until the submit path was traced end-to-end.
**Next time:** Any time a new password constraint is added to the backend, the frontend `passwordsValid` getter (or equivalent submit guard) must be updated in the same commit. The hint list and the submit guard are separate UI concerns but must enforce the same rule set. Add a comment linking them: `// must match backend RegisterRequest.password validator`.
**Tags:** auth, angular, forms, validation

---

**What happened:** The password-rules hint list was added to the signup form but initially missed the reset-password form. Both forms set a password subject to the same backend validator, so both must show the same hints.
**Why:** Constraints are implemented on one form first, then carried to similar forms as a follow-up. The follow-up is easy to skip or forget because the forms are in separate component files.
**Next time:** When adding any shared constraint (complexity rule, length limit, pattern) to a password field, immediately check all other password-setting surfaces in the project — currently: `signup`, `reset-password`, and any future "change password" form. Treat this as a required checklist step, not an optional follow-up.
**Tags:** auth, angular, forms, consistency

---

**What happened:** The `showPassword` state map in password-toggle components was typed as `Record<string, boolean>`, accepting any string key. In templates only literal strings are used, so it is safe today — but if a key were ever sourced from user input, this would be a prototype-pollution vector.
**Why:** `Record<string, boolean>` is the natural TypeScript shorthand for a string-keyed map. The risk is not obvious because Angular templates look like they pass literals, but the method signature itself imposes no constraint.
**Next time:** Type `showPassword` as `Record<'password' | 'confirmPassword' | 'currentPassword', boolean>` (or whatever the actual field names are) and type `togglePasswordVisibility(field: 'password' | 'confirmPassword' | ...)` accordingly. A union type costs nothing and narrows the method signature against future misuse.
**Tags:** security, angular, typescript, forms

---

## 2026-06-09 — SEC-3: input validation on CategoryCreate (color regex, max_length, passlib/bcrypt incompatibility)

**What happened:** `passlib 1.7.4` paired with `bcrypt 5.0.0` raises "password cannot be longer than 72 bytes" on every hash/verify call. The warning is printed to stderr but does not raise an exception — however in some pytest configurations it surfaces as an error that breaks all auth-dependent tests silently. The fix was to bypass passlib entirely and call `bcrypt.hashpw` / `bcrypt.checkpw` directly.
**Why:** passlib 1.7.4 hard-codes bcrypt internal API calls that were removed in bcrypt 4.x. The mismatch is not caught at import time — only at the moment a password is hashed or verified. This silently broke every test that required a logged-in user.
**Next time:** If adding `bcrypt` to requirements, pin it at `bcrypt>=4.0,<5` when using passlib, or drop passlib entirely and call `bcrypt.hashpw(pwd.encode(), bcrypt.gensalt())` / `bcrypt.checkpw(pwd.encode(), stored_hash)` directly. The direct approach has zero extra dependencies and no version-coupling risk.
**Tags:** auth, backend, dependencies, testing

---

## 2026-06-09 — SEC-1: `/api/auth/refresh` must remain unauthenticated — this is intentional

**What happened:** The `/api/auth/refresh` endpoint was correctly implemented without `Depends(get_current_user)`. A review note confirmed this is intentional and must not change: the refresh token is the credential for this endpoint. Adding `get_current_user` would make the endpoint unreachable by design — it exists precisely because the access token is expired.
**Why:** It is tempting to apply `Depends(get_current_user)` uniformly to all auth-related endpoints. The refresh endpoint is the one structural exception where that dependency creates a circular requirement.
**Next time:** Do not add `Depends(get_current_user)` to `/api/auth/refresh`. If a reviewer or linter flags this endpoint as unauthenticated, the answer is: the refresh token in the request body IS the credential. Add a comment to the route definition in `main.py` documenting this so future reviewers understand the intent without needing to re-derive it.
**Tags:** auth, fastapi, backend, security

---

## 2026-06-09 — SEC-4: CORS tightening (Playwright Origin stripping, env normalisation, wildcard scan, HEAD discrepancy, stale app fixture)

**What happened:** Playwright's `APIRequestContext` silently strips the `Origin` header from all requests. Every CORS assertion written using `page.request` or `request.fetch` reported that CORS headers were absent — which looked like a server misconfiguration but was actually Playwright removing the header before the request left the process.
**Why:** Playwright's request context is designed for API testing, not for network-level header inspection. Origin is a "forbidden header name" in the Fetch spec and browsers also strip it in some contexts; Playwright follows the same rule.
**Next time:** Test CORS behaviour in Playwright E2E specs by calling Node's built-in `fetch` (available in Node 18+) directly inside the test body, not via `page.request` or `request.fetch`. Set `Origin`, `Access-Control-Request-Method`, and `Access-Control-Request-Headers` explicitly on the `fetch` call. This is the only way to assert on actual CORS response headers from within a Playwright process.
**Tags:** testing, e2e, playwright, cors

---

**What happened:** The `validate_cors_for_production()` guard in `config.py` originally used `env == "production"`. `"Production"` and `"production "` (trailing space) both silently passed the check, allowing a wildcard CORS config to go undetected in a production deployment with a miscased or whitespace-padded `ENVIRONMENT` value.
**Why:** String equality checks against environment names feel complete but are not normalised. Env vars read from shell, Docker compose files, or `.env` files frequently have case or whitespace variation that is invisible to the developer.
**Next time:** All environment-name comparisons used as security gates must be normalised: `env.strip().lower() == "production"`. Apply this rule to every `if ENVIRONMENT == ...` check in `config.py` and `main.py`. A plain `==` for a security guard is a bug waiting for a misconfigured deployment.
**Tags:** security, config, backend, cors

---

**What happened:** The wildcard CORS guard checked for the exact bare token `"*"` in the origins list but did not catch origin strings containing a wildcard as a substring — e.g. `"https://*.example.com"`. The correct check is `any("*" in o for o in origins)`, which catches both `"*"` and any origin string that embeds a wildcard.
**Why:** It is natural to write `"*" in origins` (list membership test) rather than a substring scan. The list membership test only catches the exact token `"*"` and misses wildcard subdomain patterns that Starlette will also accept as a permissive config.
**Next time:** Wildcard CORS guards must use a substring scan: `any("*" in origin for origin in cors_origins)`. Never use `"*" in origins` (list membership) — it misses embedded wildcards that are equally permissive.
**Tags:** security, cors, config, backend

---

**What happened:** `allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]` was set in Starlette's `CORSMiddleware`. Unit tests using `ASGITransport` confirmed the list exactly. But live E2E tests revealed `HEAD` appearing in `Access-Control-Allow-Methods` response headers. Uvicorn implicitly registers `HEAD` for every `GET` route at the ASGI level, below the middleware — so `HEAD` is never in the config list but does appear in live preflight responses. Suppressing it requires a custom middleware.
**Why:** Starlette's `CORSMiddleware` echoes the `allow_methods` config list when constructing preflight responses in test transport. In a live server, uvicorn's automatic `HEAD`-on-`GET` registration adds `HEAD` to the actual allowed methods at the routing layer, which surfaces in real preflight responses even though the middleware config never included it.
**Next time:** Do not rely solely on `ASGITransport`-based unit tests to verify the exact set of allowed methods in CORS preflight responses. Always run at least one live E2E preflight assertion against a running server to confirm what the client actually sees. If `HEAD` must be suppressed, a custom `CORSMiddleware` subclass is required — the built-in config list is insufficient.
**Tags:** cors, testing, fastapi, starlette

---

**What happened:** Four of seven CORS unit tests were written as `from main import app` at module level (a cached import), rather than calling `_make_app()` to get a fresh instance. The tests appeared green against the new restricted `allow_methods` config but would have passed equally well against the old `allow_methods=["*"]` config — they were testing a stale object and not exercising the new code path at all.
**Why:** Module-level `from main import app` in a pytest file is evaluated once at collection time. If `main.py` changes between test runs (or if multiple test files import `app` at the top level), all those test files share the same object regardless of what the module was modified to do. Tests that rely on this cached import cannot detect configuration regressions.
**Next time:** CORS tests (and any test that needs to assert on app-level configuration) must obtain the app via a factory call (`_make_app()` or equivalent) inside the test body or fixture, not via a module-level import. A module-level `from main import app` in a test file is always testing a snapshot of the app at collection time, not a freshly configured instance.
**Tags:** testing, cors, fastapi, test-isolation

---

## 2026-06-09 — Task 30: migration test pattern, RLS omission comment, and pre-existing test debt

**What happened:** Three project conventions surfaced during Task 30 (category_budgets migration): (1) This project uses static SQL-parsing tests — no live DB — for all migration validation. The established pattern is `tests/test_password_reset_tokens_migration.py`. (2) A pytest fixture that returns `""` on `FileNotFoundError` causes all 10+ downstream tests to fail with misleading assertion messages ("expected 'CREATE TABLE' in sql") instead of one clear failure pointing at the missing file. (3) RLS is intentionally absent from all tables due to Neon compatibility, documented in `20260608000001_neon_households.sql`. Without a comment in each new migration, reviewers flag the omission as a security gap.
**Why:** Static tests keep CI fast and credential-free. The silent `return ""` fixture hides the root cause (missing file) behind 10+ false assertion failures. The RLS omission is a project-wide decision that looks like negligence on every new migration without documentation.
**Next time:** (1) Model all migration tests on `tests/test_password_reset_tokens_migration.py` — static SQL parsing, `re.search` patterns, no live DB. (2) In the SQL file fixture, replace `return ""` on `FileNotFoundError` with `pytest.fail(f"Migration file not found: {path}")`. (3) Every new migration must include: `-- RLS intentionally omitted: Neon compatibility (see 20260608000001_neon_households.sql)`.
**Tags:** testing, database, migrations, rls

---

## 2026-06-09 — 24 pre-existing test failures are known debt from the Invoice Me rename

**What happened:** Running `pytest` shows 24 failures. These are stale references from the old codebase name (Invoice Me): outdated model names, old env vars, and old API strings that were not updated when the project was renamed to Future Me. They are not regressions from recent work.
**Why:** The project was renamed mid-development and the test suite was not fully migrated.
**Next time:** Do not investigate these 24 failures as regressions. They are tracked debt. The fix is to update each failing test's model references and API strings to match the current codebase — not to revert recent changes.
**Tags:** testing, technical-debt, backend

---
