"""One-time backfill: pair existing atolye PocketBase users to companies.

Run AFTER the migration is applied AND the `companies` table is seeded via SQL.
Idempotent: skips users that already have a user_companies row. Reports any
user whose PB department has no matching company, and any company name used by
stations/work_orders that is missing from `companies`.

Department matching mirrors the station/work-order create flow
(`_get_main_company_from_department`): only the segment before the first ":" of
the PB `department` is used as the company name.

Usage:  python -m scripts.backfill_user_companies
"""
import asyncio

import httpx
from sqlalchemy import select

from app.core.config import settings
from app.core.database import RomiotAsyncSessionLocal
from app.models.romiot_models import Company, Station, UserCompany, WorkOrder


def _main_company_from_department(department: str | None) -> str:
    """Mirror of station.py:_get_main_company_from_department — the company name
    is the part of the PB department string before the first ":" (if any)."""
    value = (department or "").strip()
    if not value:
        return ""
    if ":" in value:
        return value.split(":", 1)[0].strip()
    return value


async def _pb_admin_token(client: httpx.AsyncClient) -> str:
    if not settings.POCKETBASE_ADMIN_EMAIL or not settings.POCKETBASE_ADMIN_PASSWORD:
        raise RuntimeError("PocketBase yönetici bilgileri yapılandırılmamış")
    resp = await client.post(
        f"{settings.POCKETBASE_URL}/api/admins/auth-with-password",
        json={
            "identity": settings.POCKETBASE_ADMIN_EMAIL,
            "password": settings.POCKETBASE_ADMIN_PASSWORD,
        },
    )
    resp.raise_for_status()
    token = resp.json().get("token")
    if not token:
        raise RuntimeError("PocketBase kimlik doğrulama token'ı alınamadı")
    return token


async def _list_atolye_users(client: httpx.AsyncClient, token: str) -> list[dict]:
    users: list[dict] = []
    page = 1
    while True:
        resp = await client.get(
            f"{settings.POCKETBASE_URL}/api/collections/users/records",
            params={"page": page, "perPage": 200},
            headers={"Authorization": token},
        )
        resp.raise_for_status()
        body = resp.json()
        for item in body.get("items", []):
            roles = item.get("role") or []
            if any(isinstance(r, str) and r.startswith("atolye:") for r in roles):
                users.append(item)
        if page >= body.get("totalPages", 1):
            break
        page += 1
    return users


async def main() -> None:
    async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
        token = await _pb_admin_token(client)
        pb_users = await _list_atolye_users(client, token)

    paired = 0
    skipped = 0
    unmatched_users: list[str] = []
    async with RomiotAsyncSessionLocal() as db:
        companies = {c.name: c.id for c in (await db.execute(select(Company))).scalars().all()}

        used_names = set()
        for s in (await db.execute(select(Station.company))).scalars().all():
            used_names.add((s or "").strip())
        for cf in (await db.execute(select(WorkOrder.company_from))).scalars().all():
            used_names.add((cf or "").strip())
        missing = sorted(n for n in used_names if n and n not in companies)
        if missing:
            print("WARNING: company names in use but missing from companies:", missing)

        for u in pb_users:
            pb_id = u["id"]
            existing = (await db.execute(
                select(UserCompany).where(UserCompany.pb_user_id == pb_id)
            )).scalar_one_or_none()
            if existing is not None:
                skipped += 1
                continue
            dept = _main_company_from_department(u.get("department"))
            company_id = companies.get(dept)
            if company_id is None:
                unmatched_users.append(f"{u.get('username')} (department={dept!r})")
                continue
            db.add(UserCompany(pb_user_id=pb_id, company_id=company_id))
            paired += 1
        await db.commit()

    print(f"paired={paired} skipped_existing={skipped} unmatched={len(unmatched_users)}")
    for line in unmatched_users:
        print("  UNMATCHED:", line)


if __name__ == "__main__":
    asyncio.run(main())
