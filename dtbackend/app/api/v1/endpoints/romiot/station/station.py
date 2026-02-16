from enum import Enum

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field, model_validator
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.romiot.station.auth import check_station_yonetici_role
from app.core.auth import check_authenticated
from app.core.config import settings
from app.core.database import get_postgres_db, get_romiot_db
from app.models.postgres_models import User as PostgresUser
from app.models.romiot_models import Station
from app.schemas.station import Station as StationSchema
from app.schemas.station import StationCreate, StationList
from app.schemas.user import User
from app.services.user_service import UserService

router = APIRouter()


class UserRoleType(str, Enum):
    MUSTERI = "musteri"
    OPERATOR = "operator"


@router.post("/", response_model=StationSchema, status_code=status.HTTP_201_CREATED)
async def create_station(
    station_data: StationCreate,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db)
):
    """
    Create a new station.
    Requires role 'atolye:<company>:yonetici' where company matches the station's company.
    Station names must be unique within the same company.
    """
    # Check if user has yonetici role and get company
    user_company = await check_station_yonetici_role(current_user)

    # Verify that the station company matches the user's company
    if station_data.company != user_company:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Atölye şirketi sizin şirketinizle eşleşmelidir: '{user_company}'"
        )

    # Check if a station with the same name and company already exists
    existing_station_result = await romiot_db.execute(
        select(Station).where(
            and_(
                Station.name == station_data.name,
                Station.company == station_data.company
            )
        )
    )
    existing_station = existing_station_result.scalar_one_or_none()

    if existing_station:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"'{station_data.company}' şirketinde '{station_data.name}' adında bir atölye zaten mevcut"
        )

    # Create new station
    new_station = Station(
        name=station_data.name,
        company=station_data.company,
        is_exit_station=station_data.is_exit_station
    )

    romiot_db.add(new_station)
    await romiot_db.commit()
    await romiot_db.refresh(new_station)

    return new_station


@router.get("/my-station", response_model=dict)
async def get_my_station(
    current_user: User = Depends(check_authenticated),
    postgres_db: AsyncSession = Depends(get_postgres_db),
    romiot_db: AsyncSession = Depends(get_romiot_db)
):
    """
    Get the operator's assigned station.
    Requires role 'atolye:<company>:operator'.
    """
    # Check if user has operator role
    from app.api.v1.endpoints.romiot.station.auth import check_station_operator_role
    from app.api.v1.endpoints.romiot.station.auth import get_station_company
    
    # Verify user has operator role
    has_operator_role = False
    if current_user.role and isinstance(current_user.role, list):
        for role in current_user.role:
            if isinstance(role, str) and role.startswith("atolye:") and role.endswith(":operator"):
                has_operator_role = True
                break
    
    if not has_operator_role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu işlem için operatör yetkisi gereklidir"
        )
    
    # Get user's station_id from PostgreSQL
    pg_user = await UserService.get_user_by_username(postgres_db, current_user.username)
    if not pg_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kullanıcı veritabanında bulunamadı"
        )
    
    if not pg_user.workshop_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bu operatöre atanmış atölye bulunmamaktadır"
        )
    
    # Get station details from RomIOT database
    station_result = await romiot_db.execute(
        select(Station).where(Station.id == pg_user.workshop_id)
    )
    station = station_result.scalar_one_or_none()
    
    if not station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{pg_user.workshop_id} ID'li atölye bulunamadı"
        )
    
    return {
        "station_id": station.id,
        "name": station.name,
        "company": station.company
    }


@router.get("/", response_model=list[StationList])
async def list_stations(
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db)
):
    """
    List all stations for the user's company.
    Requires role 'atolye:<company>:yonetici', 'atolye:<company>:operator', or 'atolye:<company>:musteri'.
    """
    # Check if user has any station role and get company
    from app.api.v1.endpoints.romiot.station.auth import get_station_company
    user_company = await get_station_company(current_user)

    # Get all stations for this company
    stations_result = await romiot_db.execute(
        select(Station).where(Station.company == user_company)
    )
    stations = stations_result.scalars().all()

    return list(stations)


class UserCreateRequest(BaseModel):
    username: str = Field(..., min_length=1, description="Username")
    name: str = Field(..., min_length=1, description="Full name")
    email: EmailStr = Field(..., description="Email address")
    password: str = Field(..., min_length=6, description="Password")
    password_confirm: str = Field(..., description="Password confirmation")
    station_id: int | None = Field(None, description="Station ID (required for operator, not for musteri)")
    role: UserRoleType = Field(..., description="Role: musteri or operator")

    @model_validator(mode='after')
    def validate_data(self):
        # Check password match
        if self.password != self.password_confirm:
            raise ValueError('Şifreler eşleşmiyor')
        
        # Station ID is required for operator role
        if self.role == UserRoleType.OPERATOR and not self.station_id:
            raise ValueError('Operatör rolü için atölye seçilmesi zorunludur')
        
        # Station ID should not be provided for musteri role
        if self.role == UserRoleType.MUSTERI and self.station_id is not None:
            raise ValueError('Müşteri rolü için atölye seçilmemelidir')
        
        return self


@router.post("/user", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_user_for_station(
    user_data: UserCreateRequest,
    current_user: User = Depends(check_authenticated),
    postgres_db: AsyncSession = Depends(get_postgres_db),
    romiot_db: AsyncSession = Depends(get_romiot_db)
):
    """
    Create a new user and assign them to a station.
    The user will have the same company as the yonetici creating them.
    Requires role 'atolye:<company>:yonetici'.
    """
    # Check if user has yonetici role and get company
    user_company = await check_station_yonetici_role(current_user)

    # Verify station exists and belongs to the same company (only for operator role)
    station_id_for_db = None
    if user_data.role == UserRoleType.OPERATOR:
        if not user_data.station_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Operatör rolü için atölye seçilmesi zorunludur"
            )
        
        station_result = await romiot_db.execute(
            select(Station).where(Station.id == user_data.station_id)
        )
        station = station_result.scalar_one_or_none()

        if not station:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"ID {user_data.station_id} ile atölye bulunamadı"
            )

        if station.company != user_company:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bu atölye sizin şirketinize ait değil"
            )
        
        station_id_for_db = user_data.station_id

    # Check if user already exists (by username) in PostgreSQL
    existing_user_result = await postgres_db.execute(
        select(PostgresUser).where(PostgresUser.username == user_data.username)
    )
    existing_user = existing_user_result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"'{user_data.username}' kullanıcı adı zaten kullanılıyor"
        )

    # Construct the full role: "atolye:<company>:<role>"
    full_role = f"atolye:{user_company}:{user_data.role.value}"

    # Create user in PocketBase
    pb_user_id = None
    try:
        async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
            # 1. Admin authentication
            auth_token = None
            if settings.POCKETBASE_ADMIN_EMAIL and settings.POCKETBASE_ADMIN_PASSWORD:
                try:
                    # Try newer _superusers endpoint first, fall back to legacy /api/admins
                    auth_response = await client.post(
                        f"{settings.POCKETBASE_URL}/api/collections/_superusers/auth-with-password",
                        json={
                            "identity": settings.POCKETBASE_ADMIN_EMAIL,
                            "password": settings.POCKETBASE_ADMIN_PASSWORD
                        }
                    )
                    if auth_response.status_code == 404:
                        auth_response = await client.post(
                            f"{settings.POCKETBASE_URL}/api/admins/auth-with-password",
                            json={
                                "identity": settings.POCKETBASE_ADMIN_EMAIL,
                                "password": settings.POCKETBASE_ADMIN_PASSWORD
                            }
                        )
                    if auth_response.status_code == 200:
                        auth_token = auth_response.json().get("token")
                    else:
                        raise HTTPException(
                            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail="PocketBase yönetici kimlik doğrulaması başarısız oldu"
                        )
                except HTTPException:
                    raise
                except Exception as auth_error:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=f"PocketBase kimlik doğrulama hatası: {str(auth_error)}"
                    )
            else:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="PocketBase yönetici bilgileri yapılandırılmamış"
                )

            # 2. Check if user already exists in PocketBase (by username and email)
            headers = {"Authorization": auth_token}
            
            # Check username
            check_username_response = await client.get(
                f"{settings.POCKETBASE_URL}/api/collections/users/records",
                params={"filter": f'username="{user_data.username}"'},
                headers=headers
            )

            if check_username_response.status_code == 200:
                existing_pb_users = check_username_response.json().get("items", [])
                if existing_pb_users:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"'{user_data.username}' kullanıcı adı zaten kullanılıyor"
                    )
            
            # Check email
            check_email_response = await client.get(
                f"{settings.POCKETBASE_URL}/api/collections/users/records",
                params={"filter": f'email="{user_data.email}"'},
                headers=headers
            )

            if check_email_response.status_code == 200:
                existing_pb_users = check_email_response.json().get("items", [])
                if existing_pb_users:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"'{user_data.email}' e-posta adresi zaten kullanılıyor"
                    )

            # 3. Create user in PocketBase
            user_data_pb = {
                "username": user_data.username,
                "email": user_data.email,
                "emailVisibility": True,
                "verified": True,
                "password": user_data.password,
                "passwordConfirm": user_data.password_confirm,
                "name": user_data.name,
                "role": [full_role],
                "company": user_company,
            }

            create_user_response = await client.post(
                f"{settings.POCKETBASE_URL}/api/collections/users/records",
                json=user_data_pb,
                headers=headers
            )

            if create_user_response.status_code in [200, 201]:
                pb_user_data = create_user_response.json()
                pb_user_id = pb_user_data.get("id")
            else:
                error_detail = create_user_response.text
                # Parse PocketBase error response
                try:
                    error_json = create_user_response.json()
                    error_data = error_json.get("data", {})
                    
                    # Check for email validation errors
                    if "email" in error_data:
                        email_errors = error_data["email"]
                        if isinstance(email_errors, dict) and "message" in email_errors:
                            error_msg = email_errors["message"]
                            if "already exists" in error_msg.lower() or "already in use" in error_msg.lower():
                                raise HTTPException(
                                    status_code=status.HTTP_400_BAD_REQUEST,
                                    detail=f"'{user_data.email}' e-posta adresi zaten kullanılıyor"
                                )
                            elif "invalid" in error_msg.lower() or "format" in error_msg.lower():
                                raise HTTPException(
                                    status_code=status.HTTP_400_BAD_REQUEST,
                                    detail="Geçersiz e-posta adresi formatı"
                                )
                        elif isinstance(email_errors, dict):
                            # Get the first error message
                            for field, errors in email_errors.items():
                                if isinstance(errors, dict) and "message" in errors:
                                    if "already exists" in str(errors["message"]).lower():
                                        raise HTTPException(
                                            status_code=status.HTTP_400_BAD_REQUEST,
                                            detail=f"'{user_data.email}' e-posta adresi zaten kullanılıyor"
                                        )
                    
                    # Check for username errors
                    if "username" in error_data:
                        username_errors = error_data["username"]
                        if isinstance(username_errors, dict) and "message" in username_errors:
                            error_msg = username_errors["message"]
                            if "already exists" in error_msg.lower():
                                raise HTTPException(
                                    status_code=status.HTTP_400_BAD_REQUEST,
                                    detail=f"'{user_data.username}' kullanıcı adı zaten kullanılıyor"
                                )
                    
                    # Generic error message
                    print(error_json)
                    error_message = error_json.get("message", error_detail)
                    raise HTTPException(
                        status_code=create_user_response.status_code,
                        detail=f"Kullanıcı oluşturulurken hata oluştu: {error_message}"
                    )
                except HTTPException:
                    raise
                except Exception:
                    # If parsing fails, use generic error
                    raise HTTPException(
                        status_code=create_user_response.status_code,
                        detail=f"Kullanıcı oluşturulurken hata oluştu: {error_detail}"
                    )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PocketBase'de kullanıcı oluşturulurken hata oluştu: {str(e)}"
        )

    # Create new user in primary database
    new_user = PostgresUser(
        username=user_data.username,
        name=user_data.name,
        workshop_id=station_id_for_db  # Only set for operator role, None for musteri
    )

    postgres_db.add(new_user)
    await postgres_db.commit()
    await postgres_db.refresh(new_user)

    return {
        "id": new_user.id,
        "username": new_user.username,
        "name": new_user.name,
        "email": user_data.email,
        "station_id": new_user.workshop_id,  # Will be None for musteri role
        "company": user_company,
        "role": full_role,
        "pocketbase_id": pb_user_id,
        "message": f"User created successfully. Role: {full_role}."
    }


@router.put("/{station_id}", response_model=StationSchema)
async def update_station(
    station_id: int,
    station_data: StationCreate,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db)
):
    """
    Update a station's name.
    Requires role 'atolye:<company>:yonetici' where company matches the station's company.
    Station names must be unique within the same company.
    """
    # Check if user has yonetici role and get company
    user_company = await check_station_yonetici_role(current_user)

    # Get the station
    station_result = await romiot_db.execute(
        select(Station).where(Station.id == station_id)
    )
    station = station_result.scalar_one_or_none()

    if not station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ID {station_id} ile atölye bulunamadı"
        )

    # Verify that the station belongs to the user's company
    if station.company != user_company:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu atölye sizin şirketinize ait değil"
        )

    # Verify that the new company matches the user's company
    if station_data.company != user_company:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Atölye şirketi sizin şirketinizle eşleşmeli '{user_company}'"
        )

    # Check if another station with the same name exists in the company
    if station_data.name != station.name:
        existing_station_result = await romiot_db.execute(
            select(Station).where(
                and_(
                    Station.name == station_data.name,
                    Station.company == station_data.company,
                    Station.id != station_id
                )
            )
        )
        existing_station = existing_station_result.scalar_one_or_none()

        if existing_station:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"'{station_data.company}' şirketinde '{station_data.name}' adında bir atölye zaten mevcut"
            )

    # Update station
    station.name = station_data.name
    station.company = station_data.company
    station.is_exit_station = station_data.is_exit_station

    await romiot_db.commit()
    await romiot_db.refresh(station)

    return station


@router.delete("/{station_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_station(
    station_id: int,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db)
):
    """
    Delete a station.
    Requires role 'atolye:<company>:yonetici' where company matches the station's company.
    Cannot delete a station that has work orders.
    """
    # Check if user has yonetici role and get company
    user_company = await check_station_yonetici_role(current_user)

    # Get the station
    station_result = await romiot_db.execute(
        select(Station).where(Station.id == station_id)
    )
    station = station_result.scalar_one_or_none()

    if not station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ID {station_id} ile atölye bulunamadı"
        )

    # Verify that the station belongs to the user's company
    if station.company != user_company:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu atölye sizin şirketinize ait değil"
        )

    # Check if station has work orders
    from app.models.romiot_models import WorkOrder
    work_orders_result = await romiot_db.execute(
        select(WorkOrder).where(WorkOrder.station_id == station_id).limit(1)
    )
    has_work_orders = work_orders_result.scalar_one_or_none() is not None

    if has_work_orders:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="İş emirleri olan atölye silinemez"
        )

    # Delete station
    await romiot_db.delete(station)
    await romiot_db.commit()

    return None


@router.get("/{station_id}/operators", response_model=list[dict])
async def list_station_operators(
    station_id: int,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
    postgres_db: AsyncSession = Depends(get_postgres_db)
):
    """
    List all operators assigned to a station.
    Requires role 'atolye:<company>:yonetici' where company matches the station's company.
    """
    # Check if user has yonetici role and get company
    user_company = await check_station_yonetici_role(current_user)

    # Get the station
    station_result = await romiot_db.execute(
        select(Station).where(Station.id == station_id)
    )
    station = station_result.scalar_one_or_none()

    if not station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ID {station_id} ile atölye bulunamadı"
        )

    # Verify that the station belongs to the user's company
    if station.company != user_company:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu atölye sizin şirketinize ait değil"
        )

    # Get all operators assigned to this station
    operators_result = await postgres_db.execute(
        select(PostgresUser).where(PostgresUser.workshop_id == station_id)
    )
    operators = operators_result.scalars().all()

    return [
        {
            "id": op.id,
            "username": op.username,
            "name": op.name,
            "station_id": op.workshop_id
        }
        for op in operators
    ]


class UserUpdateRequest(BaseModel):
    name: str = Field(..., min_length=1, description="User's full name")
    station_id: int | None = Field(None, description="Station ID (for operators only)")


@router.put("/operators/{user_id}", response_model=dict)
async def update_operator(
    user_id: int,
    user_data: UserUpdateRequest,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
    postgres_db: AsyncSession = Depends(get_postgres_db)
):
    """
    Update an operator's information.
    Requires role 'atolye:<company>:yonetici'.
    """
    # Check if user has yonetici role and get company
    user_company = await check_station_yonetici_role(current_user)

    # Get the user
    user_result = await postgres_db.execute(
        select(PostgresUser).where(PostgresUser.id == user_id)
    )
    user = user_result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kullanıcı bulunamadı"
        )

    # If station_id is provided, verify it exists and belongs to the same company
    if user_data.station_id:
        station_result = await romiot_db.execute(
            select(Station).where(Station.id == user_data.station_id)
        )
        station = station_result.scalar_one_or_none()

        if not station:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"ID {user_data.station_id} ile atölye bulunamadı"
            )

        if station.company != user_company:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bu atölye sizin şirketinize ait değil"
            )

    # Update user
    user.name = user_data.name
    user.workshop_id = user_data.station_id

    await postgres_db.commit()
    await postgres_db.refresh(user)

    return {
        "id": user.id,
        "username": user.username,
        "name": user.name,
        "station_id": user.workshop_id
    }


@router.delete("/operators/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_operator(
    user_id: int,
    current_user: User = Depends(check_authenticated),
    postgres_db: AsyncSession = Depends(get_postgres_db)
):
    """
    Delete an operator.
    Requires role 'atolye:<company>:yonetici'.
    Note: This only deletes from PostgreSQL. PocketBase user should be handled separately.
    """
    # Check if user has yonetici role
    await check_station_yonetici_role(current_user)

    # Get the user
    user_result = await postgres_db.execute(
        select(PostgresUser).where(PostgresUser.id == user_id)
    )
    user = user_result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kullanıcı bulunamadı"
        )

    # Delete user
    await postgres_db.delete(user)
    await postgres_db.commit()

    return None
