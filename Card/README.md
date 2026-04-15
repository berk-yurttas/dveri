# Card

This project is fully dockerized with:
- `frontend` (React, port `3000`)
- `backend` (Express + Socket.IO, port `5010`)
- `postgres` (PostgreSQL 16, port `5432`)

## Prerequisites

- Docker Desktop (Windows/Mac) or Docker Engine + Compose plugin
- Optional: a MongoDB connection string if you want one-time migration

## 1) Prepare Docker environment

1. Copy `/.env.docker.example` to `/.env` in the repository root.
2. Edit values if needed (`POSTGRES_*`, `JWT_SECRET`, etc.).

`docker-compose.yml` automatically reads root `.env`.

## 2) Start the full stack

```bash
docker compose up --build
```

Services:
- Frontend: [http://localhost:3001](http://localhost:3001) (change with `FRONTEND_HOST_PORT`)
- Backend: [http://localhost:5010](http://localhost:5010) (change with `BACKEND_HOST_PORT`)
- PostgreSQL: `localhost:5433` (change with `POSTGRES_HOST_PORT`)

Notes:
- Backend waits for PostgreSQL health check before starting.
- Backend auto-creates schema from `backend/db/schema.sql` at startup.
- If `cards` table is empty, backend seeds initial cards.

## 3) One-time MongoDB -> PostgreSQL migration (optional)

If you already have MongoDB data to carry over:

1. Ensure stack is up (`docker compose up -d`).
2. Set `MONGODB_URI` in root `.env`.
   - If your URI has no database path (`mongodb+srv://.../?...`), also set `MONGODB_DB_NAME`.
   - Migration DB selection order is: `MONGODB_DB_NAME` -> DB in URI path -> legacy default `test`.
3. Run migration inside backend container:

```bash
docker compose run --rm backend npm run migrate:mongo-to-pg
```

The script behavior:
- Imports cards only if PostgreSQL `cards` table is empty.
- Imports users only when email does not already exist.

## 4) Import cards from local image folder

To replace cards with images from `card_images/`:

```bash
docker compose run --rm backend npm run import:card-images
```

Behavior:
- Reads image files from `card_images` (mounted into backend container).
- Truncates `cards` table and re-inserts one card per image.
- If filename is `NAME_ATTACK_DEFENSE_XP` (e.g. `AESA_98_95_90.png`), stats are parsed from filename.
- Otherwise it falls back to default stats (customizable via env in `backend/.env.example`).

## Useful Docker commands

```bash
# Start in background
docker compose up -d --build

# Watch logs
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres

# Stop and keep DB data
docker compose down

# Stop and delete DB volume (full reset)
docker compose down -v
```

## Docker files added

- `docker-compose.yml`
- `backend/Dockerfile`
- `frontend/Dockerfile`
- `backend/.dockerignore`
- `frontend/.dockerignore`
- `.env.docker.example`
