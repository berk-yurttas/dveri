"""Sync PocketBase users into the Seyir PostgreSQL lookup table.

Creates (if missing) and upserts `pb_users` in the Seyir database so report SQL
can JOIN PocketBase `name` (stored as `full_name`) onto tables that only store username.

Usage:
    python scripts/sync_pb_users.py
    python -m scripts.sync_pb_users

    Docker:
    docker compose exec dtbackend python /app/scripts/sync_pb_users.py

Requires:
    POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD
    SEYIR_DB_HOST, SEYIR_DB_PORT, SEYIR_DB_NAME, SEYIR_DB_USER, SEYIR_DB_PASSWORD
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

_APP_ROOT = Path(__file__).resolve().parent.parent
if str(_APP_ROOT) not in sys.path:
    sys.path.insert(0, str(_APP_ROOT))

import httpx
import psycopg2
from psycopg2.extras import execute_values

from app.core.config import settings

TABLE_NAME = "pb_users"
PAGE_SIZE = 200

CREATE_TABLE_SQL = f"""
CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
    username   TEXT PRIMARY KEY,
    full_name  TEXT,
    email      TEXT,
    department TEXT,
    pb_id      TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

UPSERT_SQL = f"""
INSERT INTO {TABLE_NAME} (
    username, full_name, email, department, pb_id
) VALUES %s
ON CONFLICT (username) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    department = EXCLUDED.department,
    pb_id = EXCLUDED.pb_id,
    updated_at = NOW()
"""


def _seyir_connection():
    return psycopg2.connect(
        host=settings.SEYIR_DB_HOST,
        port=settings.SEYIR_DB_PORT,
        database=settings.SEYIR_DB_NAME,
        user=settings.SEYIR_DB_USER,
        password=settings.SEYIR_DB_PASSWORD,
    )


def _map_user(item: dict) -> tuple | None:
    username = (item.get("username") or "").strip()
    if not username:
        return None

    return (
        username,
        (item.get("name") or "").strip() or None,
        (item.get("email") or "").strip() or None,
        (item.get("department") or "").strip() or None,
        item.get("id"),
    )


async def _authenticate_pocketbase(client: httpx.AsyncClient) -> str:
    if not settings.POCKETBASE_ADMIN_EMAIL or not settings.POCKETBASE_ADMIN_PASSWORD:
        raise RuntimeError("PocketBase admin credentials are not configured")

    payload = {
        "identity": settings.POCKETBASE_ADMIN_EMAIL,
        "password": settings.POCKETBASE_ADMIN_PASSWORD,
    }
    endpoints = [
        f"{settings.POCKETBASE_URL}/api/admins/auth-with-password",
        f"{settings.POCKETBASE_URL}/api/collections/_superusers/auth-with-password",
    ]

    last_error = None
    for url in endpoints:
        response = await client.post(url, json=payload)
        if response.status_code == 200:
            token = response.json().get("token")
            if token:
                return token
            last_error = "PocketBase returned no token"
            continue
        last_error = f"{url} -> {response.status_code}: {response.text}"

    raise RuntimeError(f"PocketBase authentication failed: {last_error}")


async def _list_pocketbase_users(client: httpx.AsyncClient, token: str) -> list[dict]:
    users: list[dict] = []
    page = 1
    total_pages = 1
    headers = {"Authorization": token}

    while page <= total_pages:
        response = await client.get(
            f"{settings.POCKETBASE_URL}/api/collections/users/records",
            params={"page": page, "perPage": PAGE_SIZE, "sort": "username"},
            headers=headers,
        )
        response.raise_for_status()
        body = response.json()
        users.extend(body.get("items") or [])
        total_pages = body.get("totalPages") or 1
        print(f"Fetched PocketBase users page {page}/{total_pages}")
        page += 1

    return users


def _upsert_users(rows: list[tuple]) -> int:
    conn = _seyir_connection()
    try:
        with conn:
            with conn.cursor() as cursor:
                cursor.execute(CREATE_TABLE_SQL)
                execute_values(cursor, UPSERT_SQL, rows, page_size=500)
                return len(rows)
    finally:
        conn.close()


async def sync_pb_users() -> None:
    print("Starting PocketBase -> Seyir pb_users sync...")
    print(
        f"Seyir target: {settings.SEYIR_DB_HOST}:{settings.SEYIR_DB_PORT}/"
        f"{settings.SEYIR_DB_NAME}"
    )

    async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
        print("Authenticating with PocketBase...")
        token = await _authenticate_pocketbase(client)
        print("Authenticated with PocketBase")
        pb_users = await _list_pocketbase_users(client, token)

    rows = []
    skipped = 0
    for item in pb_users:
        mapped = _map_user(item)
        if mapped is None:
            skipped += 1
            continue
        rows.append(mapped)

    print(f"PocketBase users fetched: {len(pb_users)}")
    print(f"Users with username (will upsert): {len(rows)}")
    if skipped:
        print(f"Skipped (missing username): {skipped}")

    if not rows:
        print("Nothing to upsert.")
        return

    upserted = _upsert_users(rows)
    print(f"Upserted {upserted} rows into Seyir table `{TABLE_NAME}`.")
    print("Example report JOIN:")
    print(
        f"  SELECT t.*, u.full_name\n"
        f"  FROM your_table t\n"
        f"  LEFT JOIN {TABLE_NAME} u ON u.username = t.username"
    )


if __name__ == "__main__":
    asyncio.run(sync_pb_users())
