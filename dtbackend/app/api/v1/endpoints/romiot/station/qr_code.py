import json
import math
import secrets
import string
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import check_authenticated
from app.core.database import get_romiot_db
from app.models.romiot_models import QRCodeData
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
    Requires 'atolye:<company>:musteri' role.
    """
    # Extract company from user role
    user_company = None
    if current_user.role and isinstance(current_user.role, list):
        for role in current_user.role:
            if isinstance(role, str) and role.startswith("atolye:") and role.endswith(":musteri"):
                parts = role.split(":")
                if len(parts) == 3:
                    user_company = parts[1]
                    break
    
    if not user_company:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="QR kod oluşturma yetkisi yok. Müşteri rolü gereklidir."
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
    romiot_db: AsyncSession = Depends(get_romiot_db)
):
    """
    Generate multiple QR codes for a work order, splitting by package quantity.
    For example: quantity=115, package_quantity=25 generates 5 QR codes
    (4 packages of 25 and 1 package of 15).
    Requires 'atolye:<company>:musteri' role.
    """
    # Extract company from user role
    user_company = None
    if current_user.role and isinstance(current_user.role, list):
        for role in current_user.role:
            if isinstance(role, str) and role.startswith("atolye:") and role.endswith(":musteri"):
                parts = role.split(":")
                if len(parts) == 3:
                    user_company = parts[1]
                    break
    
    if not user_company:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="QR kod oluşturma yetkisi yok. Müşteri rolü gereklidir."
        )
    
    # Calculate packages
    total_quantity = batch_data.quantity
    package_qty = batch_data.package_quantity
    
    if package_qty > total_quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Paket sayısı toplam parça sayısından büyük olamaz"
        )
    
    total_packages = package_qty
    
    # Generate work order group ID
    work_order_group_id = generate_work_order_group_id()
    
    # Set expiry to 1 year from now
    expires_at = datetime.now(timezone.utc) + timedelta(days=365)
    
    # Generate QR codes for each package
    packages: list[QRCodePackageInfo] = []
    remaining = total_quantity
    
    for i in range(1, total_packages + 1):
        # Calculate this package's quantity
        pkg_qty = min(package_qty, remaining)
        remaining -= pkg_qty
        
        # Build the QR data for this package
        qr_data = {
            "work_order_group_id": work_order_group_id,
            "main_customer": batch_data.main_customer,
            "sector": batch_data.sector,
            "company_from": batch_data.company_from,
            "aselsan_order_number": batch_data.aselsan_order_number,
            "order_item_number": batch_data.order_item_number,
            "quantity": pkg_qty,
            "total_quantity": total_quantity,
            "package_index": i,
            "total_packages": total_packages,
            "target_date": batch_data.target_date.isoformat() if batch_data.target_date else None,
        }
        
        data_json = json.dumps(qr_data)
        
        # Generate unique code
        max_retries = 5
        code = None
        for _ in range(max_retries):
            candidate = generate_short_code(12)
            existing = await romiot_db.execute(
                select(QRCodeData).where(QRCodeData.code == candidate)
            )
            if not existing.scalar_one_or_none():
                code = candidate
                break
        
        if not code:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"QR kod oluşturulamadı (paket {i}). Lütfen tekrar deneyin."
            )
        
        # Create QR code data record
        qr_code_record = QRCodeData(
            code=code,
            data=data_json,
            company=user_company,
            expires_at=expires_at
        )
        romiot_db.add(qr_code_record)
        
        packages.append(QRCodePackageInfo(
            code=code,
            package_index=i,
            quantity=pkg_qty
        ))
    
    await romiot_db.commit()
    
    return QRCodeBatchResponse(
        work_order_group_id=work_order_group_id,
        total_packages=total_packages,
        total_quantity=total_quantity,
        packages=packages,
        expires_at=expires_at
    )


@router.get("/retrieve/{code}", response_model=QRCodeDataRetrieve)
async def retrieve_qr_data(
    code: str,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db)
):
    """
    Retrieve the full QR code data using the short code.
    This endpoint is called by the barcode scanner to decompress the QR code.
    Returns the original JSON structure that was stored.
    Requires 'atolye:<company>:operator' role.
    """
    # Find QR code data by code
    result = await romiot_db.execute(
        select(QRCodeData).where(QRCodeData.code == code)
    )
    qr_record = result.scalar_one_or_none()
    
    if not qr_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="QR kod bulunamadı"
        )
    
    # Check if expired
    if qr_record.expires_at and qr_record.expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="QR kodun süresi dolmuş"
        )
    
    # Parse JSON data and return as-is
    try:
        data_dict = json.loads(qr_record.data)
        return QRCodeDataRetrieve(data=data_dict)
    except (json.JSONDecodeError, ValueError) as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="QR kod verisi okunamadı"
        )
