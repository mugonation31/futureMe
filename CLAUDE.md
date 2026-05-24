# Invoice Me

Full-stack invoice management SaaS built with FastAPI + Angular + Supabase.

## Tech Stack

- **Backend:** Python 3.11, FastAPI 0.109, asyncpg, Pydantic 2.5
- **Frontend:** Angular 17.3 (standalone components), TypeScript 5.4, SCSS
- **Database:** PostgreSQL via Supabase (RLS enabled on all tables)
- **Services:** ReportLab (PDF), Resend (email), APScheduler (scheduling)
- **Auth:** Supabase Auth with ES256 JWT verification
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
pytest tests/test_invoices.py  # specific file

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
├── scheduler.py       # APScheduler job definitions
├── email_service.py   # Resend integration
├── pdf_generator.py   # ReportLab PDF creation
├── conftest.py        # Test fixtures
└── tests/             # 14 test files

frontend/src/app/
├── auth/              # Login, signup, auth guard
├── clients/           # Client CRUD
├── invoices/          # Invoice list, form, detail
├── schedules/         # Recurring invoice schedules
├── settings/          # Company/payment settings
├── dashboard/         # Stats + recent invoices
├── core/              # Singleton services (auth, api, supabase)
├── shared/            # Reusable components
├── app.routes.ts      # Route definitions
└── app.config.ts      # App providers

supabase/migrations/   # SQL migrations (RLS, triggers, indexes)
```

## API Endpoints

All prefixed with `/api/` except `/health`:

| Resource   | Endpoints                                          |
|-----------|---------------------------------------------------|
| Clients    | `GET/POST /clients`, `GET/PATCH/DELETE /clients/{id}` |
| Invoices   | `GET/POST /invoices`, `GET/PATCH/DELETE /invoices/{id}` |
| Invoice PDF| `GET /invoices/{id}/pdf`                           |
| Invoice Send| `POST /invoices/{id}/send`                        |
| Settings   | `GET/PUT /settings`                                |
| Dashboard  | `GET /dashboard`                                   |
| Schedules  | `GET/POST /schedules`, `GET/PATCH/DELETE /schedules/{id}` |
| Health     | `GET /health`                                      |

## Database

5 tables with RLS: `clients`, `company_settings`, `invoices`, `invoice_line_items`, `invoice_schedules`. All user data scoped by `user_id` with row-level security policies. Auto-updating `updated_at` triggers on all tables.

## Environment Variables

Backend requires (see `backend/.env.example`):
- `SUPABASE_URL`, `SUPABASE_JWT_SECRET` — auth
- `DATABASE_URL` — PostgreSQL connection string
- `CORS_ORIGINS` — allowed origins (comma-separated)
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` — email
- `ENVIRONMENT` — `development` or `production`
