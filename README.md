# URL Shortener

A small full-stack URL shortener: a **Next.js** frontend and a **FastAPI** backend, kept in
two independent folders so each can be run, tested and deployed on its own.

```
url-shortner/
├── backend/    FastAPI + SQLAlchemy + SQLite  (Python 3.10+)
└── frontend/   Next.js 16 App Router + React 19 + Tailwind v4  (TypeScript 5)
```

## How it works

1. The browser submits the form on the Next.js page.
2. A **Server Action** (`frontend/src/app/actions.ts`) forwards it to `POST /api/shorten`.
   The call runs on the Next.js server, so the backend URL never reaches the browser and
   the app does not depend on CORS in production.
3. FastAPI stores the link and returns a short URL such as `http://localhost:8000/aB3xY9z`.
4. Opening that URL hits the backend's catch-all route, which increments the click counter
   and issues a **307** redirect to the original address.

## Prerequisites

- Node.js 20+ (developed on 24) and npm
- Python 3.10+ and [uv](https://docs.astral.sh/uv/) (or plain `pip` + `venv`)

## Running it

Two terminals — the backend must be up before the frontend can shorten anything.

### 1. Backend (port 8000)

```bash
cd backend
cp env.example .env          # optional: defaults already work
uv sync --group dev          # creates .venv and installs dependencies
uv run uvicorn app.main:app --reload --port 8000
```

Interactive API docs: <http://localhost:8000/docs>

<details>
<summary>Without uv (pip)</summary>

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install fastapi "uvicorn[standard]" sqlalchemy pydantic pydantic-settings pytest httpx
uvicorn app.main:app --reload --port 8000
```

</details>

### 2. Frontend (port 3000)

```bash
cd frontend
cp env.example .env.local    # optional: defaults to http://localhost:8000
npm install
npm run dev
```

Open <http://localhost:3000>.

## Tests

```bash
cd backend && uv run pytest     # 10 tests covering the API, validation and redirects
cd frontend && npm run lint && npm run build
```

## API

| Method | Path               | Purpose                                              |
| ------ | ------------------ | ---------------------------------------------------- |
| `GET`  | `/health`          | Liveness probe                                        |
| `POST` | `/api/shorten`     | Create a short link (`url`, optional `custom_code`)   |
| `GET`  | `/api/links/{code}`| Link details and click count (does not count a visit) |
| `GET`  | `/{code}`          | 307 redirect to the target, increments the counter    |

Example:

```bash
curl -X POST http://localhost:8000/api/shorten \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://example.com/a/very/long/link", "custom_code": "my-link"}'
```

```json
{
  "code": "my-link",
  "target_url": "https://example.com/a/very/long/link",
  "short_url": "http://localhost:8000/my-link",
  "created_at": "2026-08-25T10:00:00Z",
  "visits": 0
}
```

Status codes: `201` created, `409` custom code taken, `422` invalid URL or code,
`404` unknown code, `503` no free code could be allocated.

## Configuration

Backend (`backend/.env`):

| Variable            | Default                        | Purpose                                 |
| ------------------- | ------------------------------ | --------------------------------------- |
| `DATABASE_URL`      | `sqlite:///./urlshortener.db`  | Any SQLAlchemy URL, e.g. PostgreSQL     |
| `BASE_URL`          | `http://localhost:8000`        | Origin used to build returned short URLs |
| `CORS_ORIGINS`      | `http://localhost:3000`        | Comma-separated allowed browser origins  |
| `CODE_LENGTH`       | `7`                            | Generated code length (base62)           |
| `CODE_MAX_ATTEMPTS` | `5`                            | Retries when a random code collides      |

Frontend (`frontend/.env.local`):

| Variable       | Default                 | Purpose                          |
| -------------- | ----------------------- | -------------------------------- |
| `API_BASE_URL` | `http://localhost:8000` | Backend origin, read server-side |

## Design notes

- **Short codes** are 7 random base62 characters from `secrets`, so they are not guessable
  from one another. A `UNIQUE` index is the source of truth; collisions are retried.
- **Click counting** uses a single `UPDATE ... SET visits = visits + 1` statement rather
  than a read-modify-write, so concurrent redirects cannot lose counts.
- **Redirects are 307**, not 301, because browsers cache 301s indefinitely and the counter
  would stop seeing traffic.
- **Open-redirect protection**: Pydantic's `HttpUrl` plus an explicit scheme check rejects
  anything that is not `http`/`https`, so `javascript:` and `data:` payloads cannot be stored.
- **Reserved codes** (`api`, `health`, `docs`, …) can never be claimed, so a vanity code
  cannot shadow a real route.

## Before deploying

`init_db()` creates tables on startup, which is fine for a demo. For production, switch to
Alembic migrations, move off SQLite to PostgreSQL via `DATABASE_URL`, set `BASE_URL` to the
real domain, and add rate limiting on `POST /api/shorten`.
# url-shortner
