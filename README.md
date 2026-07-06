# futureMe

A shared household finance app for couples and families. Calm, premium, and built around momentum — not guilt. Track your net worth, build your emergency cushion, eliminate debt, and turn monthly progress into something visible.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.11, FastAPI 0.109, asyncpg, Pydantic 2.5 |
| **Frontend** | Angular 17.3 (standalone components), TypeScript 5.4, SCSS |
| **Database** | PostgreSQL via Neon (RLS on all tables, user-scoped) |
| **Auth** | Custom JWT (HS256) — register/login via `/api/auth/*` |
| **Infra** | Docker Compose, Nginx |

---

## Quick Start

### Docker (recommended)

```bash
docker-compose up --build
```

- Frontend: http://localhost:4202
- Backend API: http://localhost:8002

### Local development

**Backend**

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # fill in your values
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend**

```bash
cd frontend
npm install
ng serve
# http://localhost:4200
```

---

## Environment Setup

Environment files are gitignored. Copy from the provided examples before running the app.

### Frontend

```bash
cp frontend/src/environments/environment.ts.example frontend/src/environments/environment.ts
cp frontend/src/environments/environment.prod.ts.example frontend/src/environments/environment.prod.ts
```

Required variables in `environment.ts`:

| Variable | Description |
|---|---|
| `apiUrl` | Backend API base URL (e.g. `http://localhost:8002/api`) |

### Backend

```bash
cp backend/.env.example backend/.env
```

Required variables in `backend/.env`:

| Variable | Description |
|---|---|
| `JWT_SECRET` | HS256 signing secret (min 32 chars) |
| `DATABASE_URL` | Neon PostgreSQL connection string (`sslmode=require`) |
| `CORS_ORIGINS` | Comma-separated list of allowed origins |
| `ENVIRONMENT` | `development` or `production` |

The backend also reads `RESEND_API_KEY` and `RESEND_FROM_EMAIL` from config — leave these blank for local development if email is not needed.

---

## Project Structure

```
future_me/
├── docker-compose.yml
├── playwright.config.ts
├── PLAN.md
├── DESIGN.md                       # Design system documentation
│
├── backend/
│   ├── main.py                     # FastAPI app + all route definitions
│   ├── config.py                   # Pydantic settings (reads from .env)
│   ├── auth.py                     # JWT verification (ES256 + HS256 fallback)
│   ├── models.py                   # Pydantic request/response models
│   ├── database.py                 # Async PostgreSQL operations (asyncpg)
│   ├── requirements.txt
│   ├── Dockerfile
│   └── tests/
│       ├── test_auth.py
│       ├── test_config.py
│       ├── test_main.py
│       ├── test_models.py
│       └── test_settings.py
│
├── frontend/src/
│   ├── styles.scss                 # Global design tokens, resets, utility classes
│   ├── index.html                  # Font loading (Inter via Google Fonts)
│   └── app/
│       ├── app.routes.ts           # Route definitions + auth guards
│       ├── app.config.ts           # Angular app providers
│       ├── auth/
│       │   ├── login/              # Login page component
│       │   ├── signup/             # Signup page component
│       │   ├── guards/             # authGuard (route protection)
│       │   └── services/           # Auth service
│       ├── core/
│       │   └── services/
│       │       └── auth.service.ts       # JWT auth service
│       ├── dashboard/
│       │   ├── components/         # DashboardComponent
│       │   └── services/           # Dashboard data service
│       ├── settings/
│       │   ├── components/         # SettingsPageComponent
│       │   ├── models/             # Settings interfaces
│       │   └── services/           # Settings data service
│       └── shared/
│           ├── navigation/         # Sticky navbar (3-column layout)
│           └── footer/             # Footer component
│
└── migrations/
    └── migrations/                 # SQL migrations (schema, RLS policies)
```

---

## Core Concepts

- **User-scoped data.** All database tables are scoped to `user_id` via Row Level Security on Neon PostgreSQL. A user can only ever read and write their own data — this is enforced at the database level, not just in application code.

- **Auth flow.** Custom JWT auth (HS256) handles sign-up, login, and session management via `/api/auth/register` and `/api/auth/login`. The FastAPI backend issues and verifies tokens; the Angular app stores the token in `localStorage` and attaches it to every API request via an HTTP interceptor.

- **Design system.** All visual language is documented in [DESIGN.md](./DESIGN.md). The core tokens live in `frontend/src/styles.scss`. Use the tokens — do not introduce hardcoded hex values or magic spacing numbers.

- **Build order.** The project is being built in phases: Auth shell → Dashboard → Money Plan → Debts → Emergency Fund → Monthly Review. See [PLAN.md](./PLAN.md) for current status.

---

## Running Tests

**Backend (pytest)**

```bash
cd backend
source venv/bin/activate
pytest               # all tests
pytest -v            # verbose output
pytest tests/test_settings.py   # single file
```

**Frontend (Karma/Jasmine)**

```bash
cd frontend
npm test
```

**E2E (Playwright)**

Playwright tests run against the Docker Compose stack. Start Docker before running:

```bash
docker-compose up -d --build
npx playwright test
```

---

## API Endpoints

The backend is early in development. Only the following endpoints exist:

| Method | Path | Auth required | Description |
|---|---|---|---|
| `GET` | `/health` | No | Health check — returns `{"status": "OK"}` |
| `GET` | `/api/settings` | Yes | Fetch the current user's settings |
| `PUT` | `/api/settings` | Yes | Create or update user settings |
| `GET` | `/api/dashboard` | Yes | Fetch dashboard stats for the current user |

All authenticated endpoints require a `Bearer <jwt>` token in the `Authorization` header.
