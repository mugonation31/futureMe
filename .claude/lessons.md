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

## 2026-06-09 — User name field split + BiDi validation (Pydantic whitespace, constraint audit, null bytes, page objects)

**What happened:** `Field(..., min_length=1)` accepted `"   "` (three spaces) as a valid name. The field validator had to call `v.strip()` explicitly before the length check — Pydantic's built-in `min_length` does not strip whitespace.
**Why:** Pydantic validates the raw value as supplied. `min_length=1` only checks that at least one character is present; it does not normalise the value first. A string of spaces has length > 0 and passes silently.
**Next time:** Any string field that should reject blank or whitespace-only input must use a `@field_validator` that calls `v.strip()` and then checks `len(v) > 0` (or re-applies `min_length`). `Field(min_length=N)` alone is insufficient for user-facing text fields.
**Tags:** validation, pydantic, backend, forms

---

**What happened:** The original `name` field had `min_length=2`. When split into `first_name` + `last_name`, each new field was given `min_length=1` and the `min_length=2` constraint was not carried forward. The gap was invisible because the tests were written for the new structure.
**Why:** When refactoring a field, attention focuses on the new structure. The original field's constraints are documented only in the old code, which is being replaced — making it easy to forget them entirely.
**Next time:** Before splitting or renaming a Pydantic field, list every constraint on the original field (`min_length`, `max_length`, `pattern`, `gt`, `le`, validators) and verify each one is re-expressed on the new fields. Treat this as a required pre-flight step, not a post-refactor check.
**Tags:** validation, pydantic, backend, refactoring

---

**What happened:** Name fields accepted Unicode BiDi override characters (U+202A–U+202E, U+2066–U+2069), which can produce misleading display names. These characters are invisible in most UIs but cause text to render in a different direction or wrap around other content.
**Why:** Standard length and pattern validators do not check Unicode control character ranges. BiDi overrides are rare enough that most developers don't think to block them.
**Next time:** Name and display-name validators in this project must include: `BIDI_OVERRIDE = set(range(0x202A, 0x202F)) | set(range(0x2066, 0x206A))` and reject any value containing a character in that set. Use `any(ord(c) in BIDI_OVERRIDE for c in v)` — never embed the Unicode codepoints literally as characters in source code.
**Tags:** security, validation, backend, unicode

---

**What happened:** When embedding a character check in a Python source file, a literal `\x00` (null byte) was written directly into the source, causing Python to refuse to parse the file entirely with "source code string cannot contain null bytes."
**Why:** Writing a bytes literal to a file without using escape sequences embeds the raw byte value into the source file itself. A `\x00` in a Python source file terminates the "string" at the OS level before the parser sees it.
**Next time:** Never embed null bytes or other non-printable control characters literally in Python source code. Use `ord(c) == 0` for null-byte checks, or `c == '\x00'` (the escape sequence, not the literal). When in doubt, use codepoint comparisons (`ord(c)`) rather than character literals for control characters.
**Tags:** python, backend, encoding, debugging

---

**What happened:** After renaming the signup form from a single `Full Name` field to `First Name` + `Last Name`, the E2E page object (`signup.page.ts`) still had `nameInput` pointing to `getByLabel('Full Name')`. Both `auth-pages.spec.ts` and `password-ux.spec.ts` broke immediately — not because their logic was wrong, but because they used the stale page object helper.
**Why:** Page object helpers are a layer of indirection that isolates selector churn. But the indirection only helps if the page object is updated first. When a field is renamed rather than added, it is easy to update the component and miss the page object.
**Next time:** When renaming or splitting any form field, update the page object before running the specs. The update order is: (1) component template, (2) page object helpers, (3) specs. If you see a spec failure on a page-object method name that hasn't changed, check whether the underlying selector has changed instead.
**Tags:** e2e, playwright, page-objects, forms

---

## 2026-06-09 — Task 31: category_budgets (GROUP BY nullable LEFT JOIN, asyncpg transaction mock, numeric bounds)

**What happened:** Adding a LEFT-JOINed `cb.monthly_limit` column to a `GROUP BY` clause caused a correctness bug — rows with different NULL vs non-NULL values for the same category were grouped separately, producing duplicate result rows. The fix was to keep `GROUP BY bc.name` only and use `MAX(cb.monthly_limit) AS budget` as an aggregate.
**Why:** A LEFT JOIN produces NULLs for unmatched rows. Including a nullable column in GROUP BY prevents NULL rows from collapsing with their non-NULL siblings, because `NULL != NULL` in GROUP BY semantics.
**Next time:** Never include a nullable LEFT-JOINed column in GROUP BY. Instead, apply an aggregate function (`MAX`, `MIN`, `COALESCE(MAX(...), 0)`) to that column and keep GROUP BY scoped to the driving table's columns only.
**Tags:** database, sql, backend, correctness

---

**What happened:** `upsert_category_budget` issued two sequential `fetchrow` calls (SELECT then INSERT/UPDATE) without a transaction. The test mock used `AsyncMock` for `conn.transaction()`, but asyncpg's real `transaction()` returns a *synchronous* context manager wrapping an async one. `AsyncMock` makes `__aenter__` an async method, so `async with conn.transaction()` worked — but `MagicMock` with a manually constructed async context manager is the correct approach when you need to assert the transaction was entered.
**Why:** asyncpg's `connection.transaction()` is a synchronous call that returns an `asyncpg.transaction.Transaction` object (used as an async context manager). `AsyncMock()` makes the call itself awaitable, which is wrong — it's not a coroutine. Using `MagicMock(return_value=async_ctx)` matches the real behaviour.
**Next time:** When mocking `conn.transaction()` in asyncpg tests, use the `attach_transaction` helper pattern: `tx_ctx = MagicMock(); tx_ctx.__aenter__ = AsyncMock(return_value=None); tx_ctx.__aexit__ = AsyncMock(return_value=False); conn.transaction = MagicMock(return_value=tx_ctx)`. Never use `conn.transaction = AsyncMock()` — asyncpg's `transaction()` is not a coroutine.
**Tags:** testing, database, asyncpg, mocking

---

**What happened:** `monthly_limit: float = Field(..., gt=0)` accepted `float('inf')` and very large values because no upper bound was declared. `category_id: str` accepted empty strings and arbitrarily long inputs because no length constraints were declared.
**Why:** `gt=0` only establishes a lower bound. Pydantic does not cap numeric fields unless `le=N` (or `lt=N`) is also declared. Similarly, `str` fields without `min_length`/`max_length` accept any length.
**Next time:** Every numeric field that represents a real-world quantity must declare both a lower bound and an upper bound: `Field(..., gt=0, le=1_000_000_000)`. Every string field used as an identifier (UUID, slug, code) must declare `min_length` and `max_length` matching the expected format. For UUID strings: `min_length=36, max_length=36`.
**Tags:** security, validation, pydantic, backend

---

## 2026-06-11 — futureMe rebuild: spec drift, DB scope, allowlists, migration directory, Neon RLS

**What happened:** The rebuild produced a generic expense tracker (transactions, categories, budget allocation) instead of the 6 agreed screens. Significant time was lost building and then tearing out features that were never in scope.
**Why:** Development proceeded without cross-checking each feature against the agreed screen map. The agreed spec (6 screens, 5 core tables) was documented in memory but not consulted before each feature was started.
**Next time:** Before starting any feature, verify it maps to one of the 6 agreed screens: Home (Dashboard), Money Plan, Debts, Emergency Fund, Monthly Review, Opportunities. If it does not, stop and challenge the scope with the user before writing any code.
**Tags:** process, planning, scope, product

---

**What happened:** Migrations added tables outside the agreed core set (accounts, income_entries, expenses, debts, savings_goals) — including a `category_budgets` table — without explicit user sign-off.
**Why:** The core table list was agreed but not enforced. Agents added schema to support out-of-scope features without raising a flag.
**Next time:** Any migration that adds a table not in the set `{accounts, income_entries, expenses, debts, savings_goals}` must be preceded by an explicit question to the user confirming the new table is required. Do not write the migration until the user confirms.
**Tags:** database, migrations, scope, process

---

**What happened:** New update functions in `database.py` were written without a column allowlist, even though the established pattern (`_ALLOWED_TRANSACTION_UPDATE_FIELDS`) was already present in the file.
**Why:** The pattern existed but was not applied when new update functions were written. Copying an existing function's structure without also copying its allowlist is the common failure mode.
**Next time:** Any function in `database.py` that builds a dynamic SQL SET clause must define `_ALLOWED_<RESOURCE>_UPDATE_FIELDS = frozenset({...})` and validate all keys against it before building the clause. Check the existing `_ALLOWED_TRANSACTION_UPDATE_FIELDS` pattern as the reference.
**Tags:** security, database, sql, backend

---

**What happened:** Migrations were written to the wrong directory (`supabase/migrations/`) rather than the project's actual migration directory (`migrations/migrations/`). The migration files were created but never ran.
**Why:** The wrong directory was assumed from the Supabase project template. This project's migration path differs.
**Next time:** The migration directory for this project is `migrations/migrations/`. Always write new `.sql` files there. Do not write to `supabase/migrations/` — it does not exist in this project.
**Tags:** database, migrations, project-structure, backend

---

**What happened:** RLS policies written using `auth.uid()` (Supabase pattern) were added to Neon-backed tables. Neon uses the `neondb_owner` role with `BYPASSRLS`, so RLS policies are application-layer concerns only — `auth.uid()` does not exist.
**Why:** The Supabase RLS pattern was applied by habit. Neon has no `auth` schema.
**Next time:** Do not add `auth.uid()` policies to any table in this project. RLS on Neon is application-layer only — enforce access scoping in the SQL queries (WHERE user_id = $1), not in RLS policies. Add `-- RLS intentionally omitted: Neon uses BYPASSRLS on neondb_owner` as a comment in each migration that enables RLS.
**Tags:** database, rls, neon, migrations

---

## 2026-06-16 — get_monthly_expenses helper: SQL OR branch testing, model/DB sync, CSP, f-string injection, falsy or-chain, stale Docker

**What happened:** A test for a helper that sums `is_recurring=true` expenses + current-month non-recurring expenses only asserted the recurring branch. Removing the `OR` clause for the non-recurring branch still passed all tests — the test was vacuous for half the logic.
**Why:** When a SQL query has `WHERE (condition_A OR condition_B)`, a test that seeds only condition_A rows never exercises condition_B. The assertion passes regardless of whether condition_B exists.
**Next time:** For every SQL `OR` condition, write at least one test that asserts the result changes when data satisfies only each branch independently. Seed one row per branch, verify both contribute to the result, then remove each and verify the count drops.
**Tags:** testing, sql, database, assertions

---

**What happened:** A field was removed from the DB insert in `database.py` but left on the Pydantic model. Callers passed the field, it was silently discarded (never written to the DB), and no error was raised by either Pydantic or asyncpg.
**Why:** asyncpg only errors on unrecognised positional parameters — extra dict keys that are never referenced in the SQL string are ignored without complaint. Pydantic accepts the field because it is still declared on the model.
**Next time:** Whenever a column is removed from a DB insert, immediately check whether it is still declared on the Pydantic request model. If it is, remove it (or mark it explicitly optional with a deprecation note). A field on the model that is never persisted is silent misinformation to every caller.
**Tags:** database, pydantic, backend, data-integrity

---

**What happened:** `unsafe-inline` was present in the Content-Security-Policy `script-src` directive. Angular 17 with the Ivy compiler never requires `unsafe-inline` for its own scripts — all Angular-generated code uses nonces or hashes internally in production builds.
**Why:** `unsafe-inline` is often added during debugging to silence CSP errors and then left in production configs. Angular developers sometimes copy CSP headers from older AngularJS or webpack configurations where it was genuinely needed.
**Next time:** On this project, `script-src` must never contain `unsafe-inline`. If a CSP error appears on Angular 17+ assets, fix it by adding the asset's hash or nonce — not by loosening to `unsafe-inline`. Audit `nginx.conf` for `unsafe-inline` any time the CSP header is modified.
**Tags:** security, csp, angular, frontend

---

**What happened:** Five `update_*` functions in `database.py` built their SQL SET clauses using f-string interpolation of column names derived from user-supplied input (`f"{key} = ${i}"`). The fix was `safe_keys = [k for k in _ALLOWED_<RESOURCE>_UPDATE_FIELDS if k in d]` before the loop.
**Why:** Even though keys come from Pydantic model dicts (not raw user input), the pattern is structurally identical to SQL column injection. A schema drift, accidental field rename, or Pydantic computed field could introduce an attacker-controlled column name.
**Next time:** Add `bandit -r backend/ -ll` to CI (or as a pre-commit hook). Rule B608 flags f-string interpolation in SQL statements and would have caught all 5 functions on first commit. Combine with the allowlist pattern: derive safe keys from `_ALLOWED_<RESOURCE>_UPDATE_FIELDS` before the loop, never from the raw input dict.
**Tags:** security, sql, database, ci

---

**What happened:** A default-value chain `d.get("x") or d.get("y", "default")` silently swallowed empty strings. If `d.get("x")` returned `""`, the `or` evaluated it as falsy and fell through to the fallback — overwriting a legitimate empty-string value with the default.
**Why:** Python's `or` short-circuits on truthiness, not on `None` / presence. An empty string is falsy, so `"" or fallback` always returns `fallback`. This is the expected Python behaviour but is wrong for "use the supplied value if the key is present."
**Next time:** Use `d.get("x") if d.get("x") is not None else d.get("y", "default")` — or better, `d["x"] if "x" in d else d.get("y", "default")`. Never use `or` chaining to pick between dict values when empty string is a valid state.
**Tags:** python, backend, data-integrity, defaults

---

**What happened:** E2E tests ran against a stale Docker container after backend changes were made. The tests correctly failed, confirming they detect the pre-fix behaviour — but the failure was initially misread as a test problem rather than a container-staleness issue.
**Why:** Docker images cache the application layer. Backend changes made outside the container are not reflected until `docker-compose up --build` is re-run. The running container is the previous code.
**Next time:** After any backend change (Python files, `requirements.txt`, migrations), always run `docker-compose up --build` before running E2E tests against the Dockerised stack. A failing E2E test after a backend change should first prompt "is the container rebuilt?" before investigating the test logic.
**Tags:** e2e, docker, testing, process

---

## 2026-06-17 — DB migration for financial conformance (debt_payments, debts, savings_goals)

**What happened:** A migration with multiple ALTER TABLE statements was written without a transaction. A failure partway through would have left the schema in an inconsistent state with no clean rollback path. BEGIN/COMMIT was added after code review caught the omission.
**Why:** Multi-step migrations feel lightweight compared to CREATE TABLE migrations, so the transaction wrapper is easy to skip. Any migration with more than one DDL statement must be atomic.
**Next time:** Every migration that contains more than one DDL statement (ALTER TABLE, ADD CONSTRAINT, CREATE INDEX, etc.) must be wrapped in `BEGIN; ... COMMIT;`. Treat the absence of a transaction as a required checklist failure, not a style preference. Single-statement migrations are the only acceptable exception.
**Tags:** database, migrations, transactions, process

---

**What happened:** `debt_payments` was built without a `user_id` foreign key, even though the acceptance criteria explicitly listed it. The test list was derived from structural SQL patterns (table shape, FK to debts, timestamp columns) — not from reading the full AC. The omission was caught in code review, not by TDD.
**Why:** When writing a test list for a new table, it is natural to enumerate structural properties visible in the schema design. Cross-cutting fields like `user_id` (present on every other user-data table in the project) can be missed if the test list is generated from "what does this table look like?" rather than "what does the AC say this table must have?"
**Next time:** Before writing the TDD test list for any new migration or DB function, read the acceptance criteria line by line and map every requirement to at least one test. Do not generate the test list from schema structure alone — the AC is the source of truth, the schema is the implementation. A test list that does not trace back to the full AC will miss requirements the AC contained.
**Tags:** testing, tdd, migrations, process

---

**What happened:** `ENABLE ROW LEVEL SECURITY` was added to `debt_payments` with no policies. On Neon, the `neondb_owner` role has `BYPASSRLS`, so enabling RLS with no policies has zero effect — all access is still permitted. A RESTRICTIVE `USING (false)` policy was added for defence-in-depth so that any connection without BYPASSRLS is denied by default.
**Why:** `ENABLE ROW LEVEL SECURITY` looks like it activates protection. In Postgres, a table with RLS enabled but no policies allows all access (for roles with BYPASSRLS, trivially; for roles without BYPASSRLS, because there are no policies to match). The statement is not protective on its own.
**Next time:** On this project, the RLS pattern for new tables is: (1) `ALTER TABLE t ENABLE ROW LEVEL SECURITY;` (2) `CREATE POLICY t_deny_all ON t AS RESTRICTIVE USING (false);` — this ensures any connection without BYPASSRLS is denied by default, providing defence-in-depth even though `neondb_owner` bypasses it. Document the rationale in a comment. Never leave RLS enabled with no policies — it provides no protection and creates a false sense of security.
**Tags:** database, rls, security, neon

---

**What happened:** Attempting to remove `style-src 'unsafe-inline'` from the Content-Security-Policy header in nginx.conf broke all Angular 17 component styles. Angular 17 with `ViewEncapsulation.Emulated` (the default) injects component styles as `<style>` tags at runtime — these are blocked by CSP unless `'unsafe-inline'` is present in `style-src`.
**Why:** `'unsafe-inline'` for `script-src` is genuinely removable in Angular 17 Ivy production builds (scripts use nonces). `style-src` is a different directive — runtime style injection is a core mechanism of Angular's emulated encapsulation, not a legacy pattern, and it requires `'unsafe-inline'`.
**Next time:** On this project, `style-src 'unsafe-inline'` is accepted risk for Angular 17 ViewEncapsulation.Emulated. Do not attempt to remove it without migrating components to `ViewEncapsulation.ShadowDom` or `ViewEncapsulation.None` with external stylesheets. The migration path is: switch to `ViewEncapsulation.ShadowDom` per component (requires browser Shadow DOM support and SCSS refactoring) — track this as a deferred security task in PLAN.md, not an immediate fix.
**Tags:** security, csp, angular, frontend

---

## 2026-06-17 — Task 13: derive debt balance from payment log (stale RETURNING *, extra="forbid" consistency, E2E probe drift)

**What happened:** `update_debt` had two return paths — a no-op path (`SELECT *`) and an update path (`RETURNING *`). Both returned the stored `balance` column. After the migration made `balance` a derived value (computed via JOIN from the payment log), both paths silently returned stale data because neither used the `_DERIVED_DEBT_SELECT` constant that computes the correct balance.
**Why:** Any path that ends with `SELECT *` or `RETURNING *` on a table whose stored column is superseded by a derived value will return the stale stored value. The derived value is only correct when fetched via the JOIN.
**Next time:** After any migration that turns a stored column into a derived value, audit every DB function that returns that resource. Create a `_DERIVED_<RESOURCE>_SELECT` constant with the JOIN, and use it in ALL return paths — including the no-op path, not just the update path. Grep for `SELECT *` and `RETURNING *` on the affected table to find all stale paths.
**Tags:** database, sql, backend, derived-values

---

**What happened:** During TDD for Task 13, only `DebtUpdate` received `extra="forbid"`. A security scan after the fact found that `AccountUpdate`, `IncomeUpdate`, `ExpenseUpdate`, and `SavingsGoalUpdate` still silently discarded unknown fields, leaving the API boundary permissive for those resources.
**Why:** `extra="forbid"` was added reactively to the model under active development rather than applied as a project-wide convention. Each TDD cycle touches one model at a time, so untouched models accumulate the gap.
**Next time:** When adding `extra="forbid"` to any Update model in this project, immediately apply it to all other Update models in `models.py` in the same commit. Run `grep -n "class.*Update" backend/models.py` to get the full list and check each one has `extra="forbid"` in its `model_config`.
**Tags:** security, pydantic, backend, api

---

**What happened:** The Task 12 E2E spec had a probe test asserting PATCH with a `balance` field returned 200 (Task 12 behaviour: silently ignored). Task 13 changed this to 422. The probe never set its "passed" flag, so 6 downstream tests that depended on it were silently skipped — showing as "skipped" with no failure signal.
**Why:** A probe test that asserts old behaviour will never fire once the behaviour is intentionally hardened. Skipped tests produce no failure signal, so the regression was invisible until the skip count was noticed.
**Next time:** When hardening a behaviour (silent ignore → explicit reject, 200 → 422), immediately update any probe test that asserted the old behaviour. After any behaviour-hardening commit, scan E2E output for unexpected skips before declaring the task complete.
**Tags:** e2e, playwright, testing, probes

---

## 2026-06-11 — Tasks 41-44: renaming an API request field requires a backward-compatibility 422 test

**What happened:** When `RegisterRequest.name` was renamed to `first_name` + `last_name`, a test was added that POSTs the old payload shape (`{ "name": "Alice Smith" }`) and asserts a 422 response. Without this test, a silent regression would go undetected: the old field name could be accepted (e.g. if a validator was accidentally removed) and callers using the old API would receive a 200 instead of a clear error.
**Why:** When a required field is renamed, the old name becomes an unknown field. Pydantic v2 ignores unknown fields by default unless `model_config = ConfigDict(extra="forbid")` is set. A backward-compatibility 422 test acts as a contract: it fails immediately if the old name is ever accidentally re-accepted, and it documents the breaking change in code.
**Next time:** When renaming a required API request field in this project, always add a test asserting the old field name returns 422. Place it alongside the new-field acceptance tests in the same test file. If the model does not already use `extra="forbid"`, consider adding it to ensure unknown fields are rejected at the model level rather than silently ignored.
**Tags:** testing, api, backend, pydantic

---

## 2026-06-11 — E2E strategy: `page.route()` + `postDataJSON()` to assert request payload shape without a live backend

**What happened:** The signup E2E spec needed to confirm that the frontend posts `first_name` / `last_name` (not the old `full_name`) without requiring a running backend. The solution was `page.route(url, handler)` to intercept the POST, call `route.request().postDataJSON()` inside the handler to capture the body as a parsed object, and assert on the captured object after `page.waitForURL()`.
**Why:** `page.route()` runs before the request leaves the browser, making it the correct hook for intercepting outgoing payloads. `postDataJSON()` parses the body as JSON, avoiding manual string parsing. This pattern lets a spec assert both the response-driven side (navigation, UI state) and the request-driven side (payload shape) in a single test with no backend.
**Next time:** Use this pattern whenever a spec needs to verify the shape or content of a request body fired by the Angular app: (1) register `page.route(urlGlob, async route => { capturedBody = await route.request().postDataJSON(); await route.fulfill({...}) })` before navigation; (2) run the form action; (3) assert `capturedBody` after the navigation completes. Wrap `postDataJSON()` in try/catch — it throws if the body is not valid JSON.
**Tags:** e2e, playwright, testing, api

---

## 2026-06-11 — Building a parseable fake JWT in Playwright E2E specs using btoa() + base64url encoding

**What happened:** The signup E2E spec mocked the register endpoint and needed to return a JWT that `AuthService.loadUserFromToken()` could parse (it calls `atob()` on the payload segment). A real signed token was not needed — only a correctly structured base64url-encoded payload. The pattern was: encode the header and payload with `btoa(JSON.stringify(...))` then apply `.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')` to convert standard base64 to base64url, and join all three segments with `.`.
**Why:** `btoa()` produces standard base64 (uses `+`, `/`, `=` padding). JWT uses base64url (uses `-`, `_`, no padding). `atob()` on the Angular side accepts both variants, so the conversion is optional for decoding but required for full correctness and for any library that validates format before decoding. The fake signature segment can be any non-empty string since the E2E spec does not verify the signature.
**Next time:** When a Playwright spec needs a fake JWT that Angular's `AuthService` can parse: use `btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')` for both the header and payload segments, join with `.`, and append any non-empty string as the signature. Include `exp: Math.floor(Date.now() / 1000) + 86400` so the token does not appear expired.
**Tags:** e2e, playwright, testing, auth

---

## 2026-07-06 — Task 20: pivot migration (dual-scope monthly_budgets, dropped 6 feature tables)

**What happened:** The pivot migration created `monthly_budgets` with a dual scope — a row is EITHER a personal budget OR a shared household budget. The first draft made `user_id` `NOT NULL ... ON DELETE CASCADE` and used it as the "creator" of household (shared) budgets too. That meant deleting the creator's account would cascade-delete the entire shared household budget plus all its `income_streams` and `budget_line_items` children — destroying data owned by every other household member. The fix: make `user_id` nullable, store it ONLY for personal budgets (household budgets are household-owned, `user_id IS NULL`), and enforce the invariant with a strict per-scope ownership CHECK (`(scope='personal' AND user_id IS NOT NULL AND household_id IS NULL) OR (scope='household' AND household_id IS NOT NULL AND user_id IS NULL)`).
**Why:** In a dual-owner / polymorphic-ownership table it is natural to reuse one FK (`user_id`) as both "owner" and "creator." An `ON DELETE CASCADE` on that FK then silently destroys rows conceptually owned by the OTHER party (the household).
**Next time:** On this project, `monthly_budgets.user_id` is per-scope: NON-NULL only for `scope='personal'`, always NULL for `scope='household'`. Never reintroduce `ON DELETE CASCADE` on `user_id` for a shared-scope row. Any new dual-scope table here must ship the per-scope ownership CHECK in the same migration.
**Tags:** database, migrations, cascade, data-integrity

---

**What happened:** `monthly_budgets.month` was not normalised to first-of-month, and the "one budget per month" guarantee was a partial-unique-index over `(scope, user_id/household_id, month)`. Because two different day-of-month values (`2026-07-01` and `2026-07-15`) are distinct, the unique index silently permitted two budgets for the same month. Goal percentages (`needs_pct`/`wants_pct`/`savings_pct`) were also left unbounded (app-layer only), so values >100 or negative could be stored. Both were tightened in the follow-up `20260706000015_budget_integrity_constraints.sql` after code review.
**Why:** A partial-unique-index whose uniqueness depends on a normalised value provides no guarantee unless the normalisation itself is enforced in the DB. The index was correct; the un-normalised `month` defeated it.
**Next time:** When a UNIQUE (or partial-unique) index depends on a normalised value, enforce the normalisation with a CHECK (`month = date_trunc('month', month)::date`) in the same migration. Bound every percentage/quantity column at the DB layer (`CHECK (needs_pct BETWEEN 0 AND 100)`), not only in Pydantic — app-layer bounds do not protect against direct writes or migrations.
**Tags:** database, migrations, constraints, data-integrity

---

**What happened:** The migration shipped with 26 static SQL-parsing tests (regex-matching the `.sql` file). They all passed but could not have caught either the CASCADE data-loss bug or the unbounded goal percentages — a static test verifies the file *says* the right thing, not that the DB *behaves* correctly. Real confidence came from Neon's branch-based flow: prepare on a throwaway branch, run behavioural insert-tests (insert deliberately-bad rows inside a `DO` block that `RAISE`s at the end to roll back so nothing persists), THEN apply to main.
**Why:** This project's established convention is static SQL-parsing migration tests (fast, credential-free). For destructive or constraint-heavy migrations that convention is insufficient on its own — it cannot exercise CHECK/CASCADE/UNIQUE behaviour.
**Next time:** For any destructive or constraint migration on this project, keep the static SQL tests but ALSO run behavioural insert-tests on a temporary Neon branch before touching main: attempt to insert rows that should violate each new CHECK/UNIQUE inside a `DO $$ ... RAISE EXCEPTION 'rollback' $$` block (so the transaction rolls back), and confirm each bad insert is rejected. Only apply to main once the branch confirms real behaviour.
**Tags:** database, migrations, testing, neon

---

**What happened:** The new child tables (`income_streams`, `budget_line_items`) scope tenant access ONLY via their `budget_id` FK — they carry no `user_id`/`household_id` of their own. RLS on all three tables is deny-all (`BYPASSRLS` app role + app-layer scoping), so the parent-budget ownership check is the SOLE tenant-isolation control for the children. A forgotten join back to `monthly_budgets` in any child query is a direct cross-tenant IDOR.
**Why:** When child rows inherit tenancy purely through a parent FK, there is no second line of defence — no per-row `household_id` to also filter on. The parent ownership check is load-bearing in a way that is easy to overlook when writing a "simple" child-table query.
**Next time:** Every query against `income_streams` or `budget_line_items` MUST join to `monthly_budgets` and enforce the same per-scope ownership predicate as the parent (personal: `user_id = $ctx`; household: `household_id IN (user's households)`). Never fetch a child row by its own id alone. Treat a child query without the parent-ownership join as a security bug in the endpoint tasks.
**Tags:** security, database, idor, backend

---

## 2026-07-07 — Task 21: Pydantic Create validators ran in mode="after" — whitespace-only labels bypassed min_length=1

**What happened:** The new `*Create` models declared `label: str = Field(min_length=1)` plus a `_sanitise_text` `field_validator`. A whitespace-only input ("   ") passed validation and was stored as an empty string. The `min_length=1` check saw the raw 3-character string and passed BEFORE `_sanitise_text` (running in the default `mode="after"`) stripped it to "". The `*Update` models were already immune because their sanitiser used `mode="before"`, so the strip happened first and `min_length` then rejected the empty result. Caught in code review; fixed by adding an explicit empty-check inside the Create validators.
**Why:** In Pydantic 2, `Field(min_length=...)` runs as part of core-schema validation. A `mode="after"` `field_validator` runs AFTER that, so any normalisation it performs (stripping) cannot feed back into the length check. Only `mode="before"` validators run early enough for `min_length` to see the normalised value.
**Next time:** On this project, every free-text `*Create`/`*Update` model must strip in a `mode="before"` validator (matching the Update models), OR carry an explicit non-empty assertion inside an after-validator. Do not rely on `min_length=1` alone to reject whitespace — it does not, unless the strip runs before it. When adding a new model, copy the Update-model validator shape, not the Create one that shipped in Task 21.
**Tags:** pydantic, validation, backend, models

---

## 2026-07-07 — Task 21: _sanitise_text applied to `label` but not `currency` — stored-reflection vector on a sibling field

**What happened:** New models routed the `label` field through `_sanitise_text` but left `currency` unsanitised. Because `currency` is echoed back on `BudgetResponse`, NUL / BiDi / `<script>` payloads could be stored and reflected. Flagged by the security scan; fixed by adding a `mode="before"` sanitise validator to `currency`.
**Why:** When a project has a shared sanitiser helper, it gets applied to the "obviously user-facing" field (label) and quietly forgotten on the less-obvious sibling (a currency code that is still free-text and still echoed). Partial coverage looks safe in review because the helper IS present in the model.
**Next time:** On this project, EVERY string field that is (a) user-supplied and (b) ever echoed in a response must pass through `_sanitise_text` via a `mode="before"` validator — currency codes, enums-stored-as-str, and codes included. When reviewing a model, grep for every `str` field and confirm each has the sanitiser, rather than confirming the sanitiser merely exists somewhere in the class.
**Tags:** security, sanitisation, stored-xss, models

---

## 2026-07-07 — Task 21: 23 stale "Invoice Me" tests mask real regressions in the pytest run

**What happened:** The Task 21 backend test run showed 23 pre-existing failures. All are stale freelancer-domain "Invoice Me" tests (Client/Invoice/Schedule/company_settings) that predate even the Task 20 pivot and target retired functions like `upsert_company_settings` that never existed in this codebase. They are pure noise but make it hard to tell whether a new change caused a real regression. Separately, `/api/settings` GET/PUT currently has NO passing test because its only tests target that non-existent `upsert_company_settings`.
**Why:** The app pivoted twice (Invoice Me → Money Flow → Intentional Spending) without deleting the superseded test files, so the suite accumulated tests for domains and functions that no longer exist.
**Next time:** Treat the 23 Invoice/Client/Schedule failures as known-stale — do NOT investigate them as regressions. When judging a Task's E2E result, filter them out and compare only the delta. Schedule a cleanup task to delete these files and write a real `/api/settings` test. Until then, a green-minus-23 run is the baseline, not 23 new problems.
**Tags:** testing, tech-debt, regression, pytest

---

## 2026-07-07 — Task 22: GET /api/budget bootstrap — auto-create-on-GET needs a bound on the client-supplied key

**What happened:** `GET /api/budget?month=...&scope=...` auto-creates and seeds ~24 rows per distinct (scope, owner, month) on first access. `month` was accepted unbounded, so a single authenticated user could iterate arbitrary months and force unbounded row creation (write-amplification / storage-DoS, OWASP A04). It is also a *side-effecting GET*, which prefetchers, link crawlers, and uptime monitors trigger automatically. Fixed with a ±12-month clamp that returns 422 outside the window.
**Why:** The write-on-read was a convenience (bootstrap-on-first-view) and the bound felt unnecessary because the value comes from an authenticated user — but auth does not limit how many distinct months one user can request, and GET is assumed side-effect-free by the whole ecosystem of automated clients.
**Next time:** For any budget/bootstrap endpoint in this project that creates rows keyed on a client-supplied value (Tasks 23-24), clamp that value to a semantically valid window and return 422 outside it. If the creation is not naturally idempotent-and-cheap, prefer an explicit POST over auto-create-on-GET. The ±12-month clamp on `month` is the reference pattern.
**Tags:** security, api, fastapi, backend

---

## 2026-07-07 — Task 22: budget endpoints — structural tenant isolation (no tenant-id param, owner resolved server-side)

**What happened:** The `GET /api/budget` route exposes no tenant/household/owner id as a parameter. The owner id is always resolved server-side from the JWT plus household membership, so cross-tenant access is structurally impossible — there is no id for a caller to tamper with. Both code review and the security scan validated this as correct and called it the pattern to reuse for the remaining budget endpoints.
**Why:** Endpoints that accept an owner/household id as a param push the tenant-isolation burden onto every handler (which must re-verify the caller owns that id). Omitting the param entirely and deriving the owner from the authenticated context removes the class of IDOR bugs by construction rather than by check.
**Next time:** For every budget endpoint in Tasks 23-24 (and any household-scoped resource), do not accept household_id / owner_id as a query or path param. Resolve it server-side from the JWT and `get_household_by_user`. If a design requires the client to pass a tenant id, treat that as a red flag to challenge before implementing.
**Tags:** security, auth, api, backend

---
