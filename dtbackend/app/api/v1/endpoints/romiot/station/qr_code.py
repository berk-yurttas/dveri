import json
import math
import secrets
import string
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import check_authenticated
from app.core.database import get_romiot_db
from app.models.romiot_models import CompanyIntegration, QRCodeData, WorkOrderPair
from app.schemas.qr_code import (
    QRCodeBatchCreate,
    QRCodeBatchResponse,
    QRCodeDataCreate,
    QRCodeDataResponse,
    QRCodeDataRetrieve,
    QRCodePackageInfo,
)
from app.schemas.user import User

router = APIRouter()


def _normalize_pairs(payload: dict) -> list[dict]:
    """Return the QR payload's `pairs` list, synthesizing it from legacy scalar
    keys (`aselsan_order_number`/`order_item_number`) when the payload predates
    F3. A single source of truth for both QR read paths so they agree on the
    shape — including treating a `pairs: null` payload the same way (coerced to
    a list, never returned as `None`)."""
    pairs = payload.get("pairs")
    if isinstance(pairs, list):
        return pairs
    legacy_order = payload.get("aselsan_order_number")
    legacy_item = payload.get("order_item_number")
    if legacy_order and legacy_item:
        return [{
            "aselsan_order_number": legacy_order,
            "order_item_number": legacy_item,
        }]
    return []


async def _resolve_pairs(romiot_db: AsyncSession, data_dict: dict) -> list[dict]:
    """Pairs for a QR payload, reconciling the two stores they can live in.

    Prefer the QR's embedded snapshot (`_normalize_pairs`), but when it carries
    none — QRs printed before F3 froze a JSON snapshot without `pairs` — fall
    back to the `work_order_pairs` table keyed by `work_order_group_id`, where
    the M1 backfill put them. Without this fallback the operator scan path reads
    an empty snapshot and wrongly reports "Sipariş bilgisi eksik" for work
    orders that demonstrably have pairs in the relational table."""
    pairs = _normalize_pairs(data_dict)
    if pairs:
        return pairs

    group_id = data_dict.get("work_order_group_id")
    if not group_id:
        return []

    result = await romiot_db.execute(
        select(WorkOrderPair)
        .where(WorkOrderPair.work_order_group_id == group_id)
        .order_by(WorkOrderPair.idx)
    )
    return [
        {
            "aselsan_order_number": row.aselsan_order_number,
            "order_item_number": row.order_item_number,
        }
        for row in result.scalars().all()
    ]


def generate_short_code(length: int = 12) -> str:
    """
    Generate a short alphanumeric code for QR compression.
    Uses uppercase letters and digits for better QR code efficiency.
    """
    # Use uppercase + digits for better QR encoding efficiency
    characters = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(characters) for _ in range(length))


def generate_work_order_group_id() -> str:
    """
    Generate a unique work order group ID.
    Format: WO-YYYYMMDD-XXXXXX (e.g., WO-20260205-A7K9M2)
    """
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    random_part = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))
    return f"WO-{date_str}-{random_part}"


@router.post("/generate", response_model=QRCodeDataResponse, status_code=status.HTTP_201_CREATED)
async def generate_qr_code(
    qr_data: QRCodeDataCreate,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db)
):
    """
    Generate a compressed QR code by storing data and returning a short code.
    The short code (10-12 characters) can be used in QR instead of full JSON.
    Accepts any JSON structure for future flexibility.
    Requires 'atolye:musteri' or 'atolye:yonetici' role.
    """
    # Company is now read from department; role is company-independent
    user_company = (current_user.department or "").strip()
    has_create_role = (
        current_user.role
        and isinstance(current_user.role, list)
        and ("atolye:musteri" in current_user.role or "atolye:yonetici" in current_user.role)
    )
    
    if not has_create_role or not user_company:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="QR kod oluşturma yetkisi yok. Müşteri veya yönetici rolü gereklidir."
        )
    
    # Convert the data dict to JSON string
    data_json = json.dumps(qr_data.data)
    
    # Generate unique code (retry if collision occurs)
    max_retries = 5
    for _ in range(max_retries):
        code = generate_short_code(12)
        
        # Check if code already exists
        existing = await romiot_db.execute(
            select(QRCodeData).where(QRCodeData.code == code)
        )
        if not existing.scalar_one_or_none():
            break
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="QR kod oluşturulamadı. Lütfen tekrar deneyin."
        )
    
    # Set expiry to 1 year from now (adjust as needed)
    expires_at = datetime.now(timezone.utc) + timedelta(days=365)
    
    # Create QR code data record
    qr_code_record = QRCodeData(
        code=code,
        data=data_json,
        company=user_company,
        expires_at=expires_at
    )
    
    romiot_db.add(qr_code_record)
    await romiot_db.commit()
    await romiot_db.refresh(qr_code_record)
    
    return QRCodeDataResponse(
        code=code,
        expires_at=expires_at
    )


@router.post("/generate-batch", response_model=QRCodeBatchResponse, status_code=status.HTTP_201_CREATED)
async def generate_qr_code_batch(
    batch_data: QRCodeBatchCreate,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """
    Generate multiple QR codes for a work order, splitting by package quantity.
    F1: target validated against company_integrations.
    F3: payload carries pairs[], persisted into work_order_pairs.
    """
    sender_company = (current_user.department or "").strip()
    role_values = current_user.role if isinstance(current_user.role, list) else []
    is_musteri = "atolye:musteri" in role_values
    is_yonetici = "atolye:yonetici" in role_values
    has_create_role = is_musteri or is_yonetici

    if not has_create_role or not sender_company:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="QR kod oluşturma yetkisi yok. Müşteri veya yönetici rolü gereklidir.",
        )

    submitted_target = batch_data.target_company.strip()
    if not submitted_target:
        raise HTTPException(status_code=400, detail="Hedef firma boş olamaz.")

    # F1.4: yönetici-only locks target to own company
    if is_yonetici and not is_musteri:
        if submitted_target != sender_company:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bu hedef firma için QR kod oluşturma yetkiniz yok.",
            )

    # F1: target must exist in company_integrations
    integration_check = await romiot_db.execute(
        select(CompanyIntegration.id).where(CompanyIntegration.company == submitted_target).limit(1)
    )
    if integration_check.scalar_one_or_none() is None:
        raise HTTPException(status_code=400, detail="Hedef firma bulunamadı")

    # Package math (unchanged)
    total_quantity = batch_data.quantity
    total_packages = batch_data.package_quantity
    if total_packages > total_quantity:
        raise HTTPException(
            status_code=400,
            detail="Paket sayısı toplam parça sayısından büyük olamaz",
        )

    base_qty = total_quantity // total_packages
    remainder = total_quantity % total_packages

    work_order_group_id = generate_work_order_group_id()
    expires_at = datetime.now(timezone.utc) + timedelta(days=365)

    # Persist pairs once for this group
    pair_dicts = [
        {"aselsan_order_number": p.aselsan_order_number, "order_item_number": p.order_item_number}
        for p in batch_data.pairs
    ]
    for idx, p in enumerate(pair_dicts):
        romiot_db.add(
            WorkOrderPair(
                work_order_group_id=work_order_group_id,
                idx=idx,
                aselsan_order_number=p["aselsan_order_number"],
                order_item_number=p["order_item_number"],
            )
        )

    packages: list[QRCodePackageInfo] = []
    for i in range(1, total_packages + 1):
        pkg_qty = base_qty + (1 if i <= remainder else 0)

        qr_data = {
            "work_order_group_id": work_order_group_id,
            "main_customer": batch_data.main_customer,
            "sector": batch_data.sector,
            "company_from": sender_company,
            "teklif_number": batch_data.teklif_number,
            "pairs": pair_dicts,
            "part_number": batch_data.part_number,
            "revision_number": batch_data.revision_number,
            "quantity": pkg_qty,
            "total_quantity": total_quantity,
            "package_index": i,
            "total_packages": total_packages,
            "target_date": batch_data.target_date.isoformat(),
        }

        data_json = json.dumps(qr_data)

        # Unique short code (5 retries)
        code = None
        for _ in range(5):
            candidate = generate_short_code(12)
            existing = await romiot_db.execute(
                select(QRCodeData).where(QRCodeData.code == candidate)
            )
            if not existing.scalar_one_or_none():
                code = candidate
                break

        if not code:
            await romiot_db.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"QR kod oluşturulamadı (paket {i}). Lütfen tekrar deneyin.",
            )

        romiot_db.add(QRCodeData(
            code=code,
            data=data_json,
            company=submitted_target,
            expires_at=expires_at,
        ))

        packages.append(QRCodePackageInfo(code=code, package_index=i, quantity=pkg_qty))

    await romiot_db.commit()

    return QRCodeBatchResponse(
        work_order_group_id=work_order_group_id,
        total_packages=total_packages,
        total_quantity=total_quantity,
        packages=packages,
        expires_at=expires_at,
    )


@router.get("/retrieve/{code}", response_model=QRCodeDataRetrieve)
async def retrieve_qr_data(
    code: str,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """
    Retrieve full QR data using the short code. F3: legacy QR payloads that
    contain `aselsan_order_number`/`order_item_number` are normalized into the
    new `pairs:[{...}]` shape on the fly so old printed QRs keep working.
    """
    result = await romiot_db.execute(select(QRCodeData).where(QRCodeData.code == code))
    qr_record = result.scalar_one_or_none()
    if not qr_record:
        raise HTTPException(status_code=404, detail="QR kod bulunamadı")
    if qr_record.expires_at and qr_record.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="QR kodun süresi dolmuş")

    try:
        data_dict = json.loads(qr_record.data)
    except (json.JSONDecodeError, ValueError):
        raise HTTPException(status_code=500, detail="QR kod verisi okunamadı")

    # Legacy normalization — drop the legacy scalar keys and set a canonical
    # `pairs` list. Falls back to the work_order_pairs table when the snapshot
    # has none, so old QRs (frozen JSON without pairs) still resolve their pairs.
    data_dict.pop("aselsan_order_number", None)
    data_dict.pop("order_item_number", None)
    data_dict["pairs"] = await _resolve_pairs(romiot_db, data_dict)

    return QRCodeDataRetrieve(data=data_dict)


@router.get("/group/{work_order_group_id}", response_model=list[dict])
async def get_qr_codes_by_work_order_group(
    work_order_group_id: str,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """
    Retrieve all QR codes for a work order group.

    F1: müşteri sees groups they originated (JSON `company_from = department`).
    Other atolye roles see groups stored under their own company.
    """
    role_values = current_user.role if current_user.role and isinstance(current_user.role, list) else []
    has_atolye_role = any(
        r in {"atolye:operator", "atolye:yonetici", "atolye:musteri", "atolye:satinalma"}
        for r in role_values
    )
    if not has_atolye_role:
        raise HTTPException(status_code=403, detail="Atölye yetkisi gereklidir.")

    department_value = (current_user.department or "").strip()
    if not department_value:
        raise HTTPException(status_code=403, detail="Kullanıcı şirket bilgisi bulunamadı.")

    is_musteri = "atolye:musteri" in role_values

    if is_musteri:
        query = text(
            """
            SELECT code, data
            FROM qr_code_data
            WHERE data::jsonb ->> 'work_order_group_id' = :group_id
              AND data::jsonb ->> 'company_from' = :dept
            ORDER BY (data::jsonb ->> 'package_index')::int
            """
        )
        result = await romiot_db.execute(query, {"group_id": work_order_group_id, "dept": department_value})
    else:
        query = text(
            """
            SELECT code, data
            FROM qr_code_data
            WHERE company = :company
              AND data::jsonb ->> 'work_order_group_id' = :group_id
            ORDER BY (data::jsonb ->> 'package_index')::int
            """
        )
        result = await romiot_db.execute(query, {"company": department_value, "group_id": work_order_group_id})

    rows = result.fetchall()
    if not rows:
        return []

    response_items: list[dict] = []
    for row in rows:
        try:
            payload = json.loads(row.data)
        except (json.JSONDecodeError, ValueError):
            continue

        # Normalize legacy single-pair payloads (shared helper — identical shape
        # to the /retrieve endpoint).
        pairs = _normalize_pairs(payload)

        response_items.append({
            "code": row.code,
            "work_order_group_id": payload.get("work_order_group_id"),
            "main_customer": payload.get("main_customer"),
            "sector": payload.get("sector"),
            "company_from": payload.get("company_from"),
            "teklif_number": payload.get("teklif_number"),
            "pairs": pairs,
            "part_number": payload.get("part_number"),
            "quantity": payload.get("quantity"),
            "total_quantity": payload.get("total_quantity"),
            "package_index": payload.get("package_index"),
            "total_packages": payload.get("total_packages"),
            "target_date": payload.get("target_date"),
        })

    return response_items
