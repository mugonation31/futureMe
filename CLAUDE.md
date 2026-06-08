# Future Me

Full-stack personal finance app built with FastAPI + Angular + Neon PostgreSQL.

## Tech Stack

- **Backend:** Python 3.11, FastAPI 0.109, asyncpg, Pydantic 2.5
- **Frontend:** Angular 17.3 (standalone components), TypeScript 5.4, SCSS
- **Database:** PostgreSQL via Neon (RLS enabled on all tables)
- **Auth:** Custom JWT (HS256) — register/login via `/api/auth/*`, verified in `auth.py`
- **Email:** Resend (password reset emails)
- **Infra:** Docker Compose, Nginx

## Quick Start

```bash
# Docker (recommended)
docker-compose up --build
# Frontend: http://localhost:4201 | Backend: http://localhost:8001

# Local backend
cd backend && source venv/bin/activate && pip install -r requirements.txt
cp .env.example .env  # fill in values
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Local frontend
cd frontend && npm install && ng serve
# http://localhost:4200
```

## Running Tests

```bash
# Backend (pytest)
cd backend && source venv/bin/activate
pytest           # all tests
pytest -v        # verbose
pytest tests/test_transactions.py  # specific file

# Frontend (Karma/Jasmine)
cd frontend && npm test
```

## Project Structure

```
backend/
├── main.py            # FastAPI app + all endpoints
├── config.py          # Pydantic settings
├── auth.py            # JWT validation, get_current_user
├── models.py          # Request/response Pydantic models
├── database.py        # All async DB operations
├── email_service.py   # Resend integration (password reset)
├── conftest.py        # Test fixtures
└── tests/             # Test files

frontend/src/app/
├── auth/              # Login, signup, reset password, auth guard
├── onboarding/        # Household create/join flow
├── household/         # Household service + guard
├── dashboard/         # Stats overview
├── transactions/      # Transaction list, form, CRUD
├── settings/          # User settings
├── landing/           # Public landing page
├── core/              # Singleton services (auth, api)
├── shared/            # Reusable components (nav, footer)
├── app.routes.ts      # Route definitions
└── app.config.ts      # App providers

migrations/migrations/ # SQL migrations (schema, RLS, triggers, indexes)
```

## API Endpoints

All prefixed with `/api/` except `/` and `/health`:

| Resource       | Endpoints                                                            |
|----------------|----------------------------------------------------------------------|
| Auth           | `POST /api/auth/register`, `POST /api/auth/login`                   |
| Password Reset | `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`   |
| Settings       | `GET/PUT /api/settings`                                              |
| Dashboard      | `GET /api/dashboard`                                                 |
| Households     | `POST /api/households`, `GET /api/households/me`, `GET /api/households/invite-code`, `POST /api/households/join` |
| Categories     | `GET/POST /api/categories`                                           |
| Transactions   | `GET/POST /api/transactions`, `GET/PATCH/DELETE /api/transactions/{id}` |
| Health         | `GET /health`                                                        |

## Database

7 tables: `users`, `user_settings`, `households`, `household_members`, `budget_categories`, `transactions`, `password_reset_tokens`. All user data scoped by household or user with row-level security policies.

## Environment Variables

Backend requires (see `backend/.env.example`):
- `JWT_SECRET` — HS256 signing secret (min 32 chars)
- `DATABASE_URL` — Neon PostgreSQL connection string (`sslmode=require`)
- `CORS_ORIGINS` — allowed origins (comma-separated)
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` — email (password reset)
- `FRONTEND_URL` — used in reset email links
- `ENVIRONMENT` — `development` or `production`
