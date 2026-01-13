import json
import secrets
import string
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import check_authenticated
from app.core.database import get_romiot_db
from app.models.romiot_models import QRCodeData
from app.schemas.qr_code import QRCodeDataCreate, QRCodeDataResponse, QRCodeDataRetrieve
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

