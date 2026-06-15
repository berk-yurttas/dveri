"""Recreate the qr_code_data rows for an atolye work order group whose QR
records were lost/deleted while its work_orders rows still exist.

In atolye a "work order" is a work_order_group_id. Its scannable QR codes live
in the qr_code_data table (one row per package), each holding a 12-char short
code plus a JSON payload; the printed/displayed QR encodes only the short code
and the full payload is looked up server-side on scan. When those rows are gone,
operators can no longer reprint or scan the group, and the yönetici/müşteri "not
yet scanned" listing (which reads qr_code_data) loses the group.

This script rebuilds those rows from the surviving work_orders +
work_order_pairs rows, reproducing the payload that generate_qr_code_batch
originally wrote:

  * shared fields (main_customer, sector, company_from[_id], teklif_number,
    part_number, revision_number, total_quantity, total_packages, target_date)
    come from the group's work_orders rows (identical across the group);
  * pairs come from work_order_pairs (legacy scalar columns as a fallback);
  * the storage-tenant `company` is the company that owns the stations the
    group was scanned at — the same rule the app uses in
    work_order._company_for_group_local, and what the original target_company
    resolved to once the manufacturer scanned the QR;
  * per-package quantity is the scanned row's quantity for that package_index,
    falling back to the deterministic base/remainder split (the exact split
    generate_qr_code_batch used) for packages that were never scanned.

NEW short codes are generated — the originals are unrecoverable, and that is
fine: the codes are opaque pointers, so freshly printed QR labels carrying the
new codes scan identically. By default the work_orders.qr_code back-reference
(which still points at the dead old code) is left untouched; pass
--update-work-orders to repoint each package's rows at its new code.

Idempotency: if qr_code_data rows already exist for the group the script aborts
unless --force is given, so a re-run never silently duplicates QR codes.

Run from the dtbackend directory (so .env / app.* import):

    python -m scripts.recreate_qr_codes WO-20260205-A7K9M2
    python -m scripts.recreate_qr_codes WO-20260205-A7K9M2 --dry-run
    python -m scripts.recreate_qr_codes WO-20260205-A7K9M2 --company MEKASAN
    python -m scripts.recreate_qr_codes WO-20260205-A7K9M2 --force --update-work-orders
"""
import argparse
import asyncio
import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, text, update

from app.api.v1.endpoints.romiot.station.qr_code import generate_short_code
from app.core.database import RomiotAsyncSessionLocal
from app.models.romiot_models import QRCodeData, Station, WorkOrder, WorkOrderPair


async def _resolve_target_company(db, group_id: str, override: str | None) -> str:
    """The storage-tenant `company` for the group's qr_code_data rows.

    Mirrors work_order._company_for_group_local: the company owning the stations
    the group was scanned at. Returns the single distinct value; raises if the
    group spans multiple companies (operator must disambiguate with --company)
    or none could be found, unless an explicit override is supplied."""
    if override:
        return override
    result = await db.execute(
        select(Station.company)
        .join(WorkOrder, WorkOrder.station_id == Station.id)
        .where(WorkOrder.work_order_group_id == group_id)
        .distinct()
    )
    companies = [row[0] for row in result.all() if row[0]]
    if not companies:
        raise SystemExit(
            "Bu grubun iş emirleri için istasyon firması bulunamadı. "
            "Hedef firmayı --company ile verin."
        )
    if len(companies) > 1:
        raise SystemExit(
            f"Bu grup birden fazla firmada taranmış ({', '.join(sorted(companies))}). "
            "Hedef firmayı --company ile seçin."
        )
    return companies[0]


async def _resolve_pairs(db, group_id: str) -> list[dict]:
    """pairs[] for the group, ordered by idx; falls back to the oldest
    work_orders row's legacy scalar columns (mirrors _pairs_for_group)."""
    result = await db.execute(
        select(WorkOrderPair)
        .where(WorkOrderPair.work_order_group_id == group_id)
        .order_by(WorkOrderPair.idx)
    )
    rows = result.scalars().all()
    if rows:
        return [
            {"aselsan_order_number": r.aselsan_order_number,
             "order_item_number": r.order_item_number}
            for r in rows
        ]

    legacy = (await db.execute(
        select(WorkOrder.aselsan_order_number, WorkOrder.order_item_number)
        .where(WorkOrder.work_order_group_id == group_id)
        .order_by(WorkOrder.id)
        .limit(1)
    )).first()
    if legacy and legacy[0] and legacy[1]:
        return [{"aselsan_order_number": legacy[0], "order_item_number": legacy[1]}]
    return []


async def _generate_unique_code(db, used: set[str]) -> str:
    """A 12-char short code not present in qr_code_data nor already minted this
    run. Same generator/length as generate_qr_code_batch."""
    for _ in range(20):
        candidate = generate_short_code(12)
        if candidate in used:
            continue
        exists = await db.execute(
            select(QRCodeData.id).where(QRCodeData.code == candidate)
        )
        if exists.scalar_one_or_none() is None:
            used.add(candidate)
            return candidate
    raise SystemExit("Benzersiz QR kodu üretilemedi. Lütfen tekrar deneyin.")


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Recreate lost qr_code_data rows for an atolye work order group."
    )
    parser.add_argument("group_id", help="work_order_group_id, e.g. WO-20260205-A7K9M2")
    parser.add_argument(
        "--company",
        help="Override the storage-tenant company (default: the group's station company)",
    )
    parser.add_argument(
        "--expires-days", type=int, default=365,
        help="QR expiry in days from now (default: 365, matching the app)",
    )
    parser.add_argument(
        "--update-work-orders", action="store_true",
        help="Also repoint work_orders.qr_code/qr_created_at at the new codes",
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Proceed even if qr_code_data rows already exist for this group",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Show what would be created without writing anything",
    )
    args = parser.parse_args()

    group_id = args.group_id.strip()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=args.expires_days)

    async with RomiotAsyncSessionLocal() as db:
        # 1. Surviving work_orders rows for the group.
        rows = (await db.execute(
            select(WorkOrder)
            .where(WorkOrder.work_order_group_id == group_id)
            .order_by(WorkOrder.id)
        )).scalars().all()
        if not rows:
            raise SystemExit(f"work_orders içinde '{group_id}' grubu bulunamadı.")

        canonical = rows[0]

        # Sanity: shared fields should be identical across the group; warn loudly
        # if a row disagrees (manual edits) so the operator can verify the result.
        for field in ("main_customer", "sector", "company_from", "teklif_number",
                      "part_number", "revision_number", "total_quantity",
                      "total_packages", "target_date"):
            distinct = {getattr(r, field) for r in rows}
            if len(distinct) > 1:
                print(f"UYARI: '{field}' grup içinde tutarsız: {distinct}. "
                      f"Kanonik (en eski) satır değeri kullanılacak: {getattr(canonical, field)!r}")

        total_quantity = canonical.total_quantity
        total_packages = canonical.total_packages
        if not total_packages or total_packages < 1:
            raise SystemExit(f"Geçersiz total_packages: {total_packages!r}")

        # 2. Abort if QR rows already exist (unless --force).
        existing_count = (await db.execute(
            text("SELECT count(*) FROM qr_code_data "
                 "WHERE data::jsonb ->> 'work_order_group_id' = :gid"),
            {"gid": group_id},
        )).scalar() or 0
        if existing_count and not args.force:
            raise SystemExit(
                f"Bu grup için zaten {existing_count} qr_code_data satırı var. "
                "Yine de devam etmek için --force kullanın."
            )

        # 3. Storage-tenant company + pairs.
        target_company = await _resolve_target_company(db, group_id, args.company)
        pair_dicts = await _resolve_pairs(db, group_id)
        if not pair_dicts:
            print("UYARI: work_order_pairs ve legacy kolonlarda sipariş/kalem "
                  "çifti bulunamadı. Payload'lar boş pairs[] ile yazılacak.")

        # 4. Per-package quantity: observed scan value wins; otherwise the
        #    deterministic base/remainder split generate_qr_code_batch used.
        observed_qty: dict[int, int] = {}
        for r in rows:
            observed_qty.setdefault(r.package_index, r.quantity)
        base_qty, remainder = divmod(total_quantity, total_packages)

        target_date_iso = (
            canonical.target_date.isoformat() if canonical.target_date else None
        )

        # 5. Build one payload + code per package (1..total_packages).
        used_codes: set[str] = set()
        plan: list[tuple[int, int, str]] = []  # (package_index, quantity, code)
        for i in range(1, total_packages + 1):
            pkg_qty = observed_qty.get(i, base_qty + (1 if i <= remainder else 0))
            code = await _generate_unique_code(db, used_codes)
            plan.append((i, pkg_qty, code))

        # 6. Report.
        print(f"\nGrup           : {group_id}")
        print(f"Hedef firma    : {target_company}")
        print(f"Gönderen firma : {canonical.company_from}")
        print(f"Parça No       : {canonical.part_number}")
        print(f"Toplam adet    : {total_quantity}  Paket sayısı: {total_packages}")
        print(f"Çiftler        : {pair_dicts}")
        print(f"Son geçerlilik : {expires_at.isoformat()}")
        if existing_count:
            print(f"NOT: --force ile {existing_count} mevcut satırın yanına ekleniyor.")
        print("\nPaketler:")
        for i, qty, code in plan:
            synth = " (taranmamış paket - split'ten)" if i not in observed_qty else ""
            print(f"  Paket {i}/{total_packages}: adet={qty}  kod={code}{synth}")

        if args.dry_run:
            print("\n[dry-run] Hiçbir şey yazılmadı.")
            return

        # 7. Insert the qr_code_data rows (payload shape mirrors
        #    generate_qr_code_batch exactly).
        for i, qty, code in plan:
            qr_data = {
                "work_order_group_id": group_id,
                "main_customer": canonical.main_customer,
                "sector": canonical.sector,
                "company_from": canonical.company_from,
                "company_from_id": canonical.company_from_id,
                "teklif_number": canonical.teklif_number,
                "pairs": pair_dicts,
                "part_number": canonical.part_number,
                "revision_number": canonical.revision_number,
                "quantity": qty,
                "total_quantity": total_quantity,
                "package_index": i,
                "total_packages": total_packages,
                "target_date": target_date_iso,
            }
            db.add(QRCodeData(
                code=code,
                data=json.dumps(qr_data),
                company=target_company,
                expires_at=expires_at,
            ))

        # 8. Optionally repoint the work_orders back-reference at the new codes.
        if args.update_work_orders:
            for i, _qty, code in plan:
                await db.execute(
                    update(WorkOrder)
                    .where(
                        WorkOrder.work_order_group_id == group_id,
                        WorkOrder.package_index == i,
                    )
                    .values(qr_code=code, qr_created_at=now)
                )

        await db.commit()

    print(f"\n✓ {len(plan)} qr_code_data satırı oluşturuldu"
          + (" ve work_orders.qr_code güncellendi." if args.update_work_orders else "."))


if __name__ == "__main__":
    asyncio.run(main())
