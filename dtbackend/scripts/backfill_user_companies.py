"""One-time seed + backfill for the company registry.

For every PocketBase user that has an `atolye:...` role, this script:
  1. Derives the company NAME from the user's PB `department` (the segment
     before the first ":", mirroring the station/work-order create flow).
  2. Auto-creates a `companies` row for each distinct department name that
     isn't already in the registry, with a random unique integer PLACEHOLDER
     `code` (the real Mekasan codes are filled in later — code is NOT NULL +
     UNIQUE and feeds SubcontractorID, so it can't be left blank).
  3. Pairs each atolye user to their company in `user_companies`.

Run AFTER the migration is applied. Idempotent: existing companies (by name)
are reused, and users that already have a user_companies row are skipped. Both
the company inserts and the pairings commit in a single transaction. Also
warns about company names used by stations/work_orders that have no registry
row (those are NOT auto-created — only user departments are seeded).

Usage:  python -m scripts.backfill_user_companies
"""
import asyncio
import random

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

    created = 0
    paired = 0
    skipped = 0
    unmatched_users: list[str] = []
    async with RomiotAsyncSessionLocal() as db:
        existing_companies = (await db.execute(select(Company))).scalars().all()
        companies = {c.name: c.id for c in existing_companies}
        used_codes = {c.code for c in existing_companies}

        def _gen_unique_code() -> str:
            """A random 6-digit integer code (as text), unique across existing
            + this batch. Placeholder only — real Mekasan codes are set later."""
            while True:
                candidate = str(random.randint(100000, 999999))
                if candidate not in used_codes:
                    used_codes.add(candidate)
                    return candidate

        # 1. Auto-create a company for each distinct atolye-user department name.
        dept_names = sorted(
            {_main_company_from_department(u.get("department")) for u in pb_users} - {""}
        )
        for name in dept_names:
            if name in companies:
                continue
            company = Company(name=name, code=_gen_unique_code())
            db.add(company)
            await db.flush()  # assign company.id for the pairing step
            companies[name] = company.id
            created += 1

        # Informational: company names used by stations/work_orders that have no
        # registry row (not auto-created — only user departments are seeded).
        used_names = set()
        for s in (await db.execute(select(Station.company))).scalars().all():
            used_names.add((s or "").strip())
        for cf in (await db.execute(select(WorkOrder.company_from))).scalars().all():
            used_names.add((cf or "").strip())
        missing = sorted(n for n in used_names if n and n not in companies)
        if missing:
            print("WARNING: company names in use (stations/work_orders) with no registry row:", missing)

        # 2. Pair each atolye user to their company.
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
                # Only happens when the user has an empty department.
                unmatched_users.append(f"{u.get('username')} (department={dept!r})")
                continue
            db.add(UserCompany(pb_user_id=pb_id, company_id=company_id))
            paired += 1

        await db.commit()

    print(f"companies_created={created} paired={paired} skipped_existing={skipped} unmatched={len(unmatched_users)}")
    print("NOTE: auto-created company codes are random placeholders — set real Mekasan codes before relying on SubcontractorID.")
    for line in unmatched_users:
        print("  UNMATCHED:", line)


if __name__ == "__main__":
    asyncio.run(main())
