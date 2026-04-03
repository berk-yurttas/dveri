import re
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
from app.models.romiot_models import Station, WorkOrderLinkDirectory
from app.schemas.station import Station as StationSchema
from app.schemas.station import StationCreate, StationList
from app.schemas.user import User
from app.services.user_service import UserService

router = APIRouter()


class UserRoleType(str, Enum):
    MUSTERI = "musteri"
    OPERATOR = "operator"


class ManagedUserRoleType(str, Enum):
    YONETICI = "yonetici"
    MUSTERI = "musteri"
    OPERATOR = "operator"
    SATINALMA = "satinalma"


class ManagedUserResponse(BaseModel):
    pocketbase_id: str
    username: str
    name: str | None = None
    email: str | None = None
    role: ManagedUserRoleType | None = None
    station_id: int | None = None
    station_name: str | None = None
    company: str
    is_self: bool = False


def _validate_password_strength(password: str) -> None:
    if len(password) < 8:
        raise ValueError("Şifre en az 8 karakter olmalıdır")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Şifre en az 1 büyük harf içermelidir")
    if not re.search(r"[a-z]", password):
        raise ValueError("Şifre en az 1 küçük harf içermelidir")
    if not re.search(r"[^a-zA-Z0-9]", password):
        raise ValueError("Şifre en az 1 özel karakter içermelidir")
    for i in range(len(password) - 3):
        seq = [ord(password[i + j]) for j in range(4)]
        if all(48 <= c <= 57 for c in seq):
            if seq[1] == seq[0] + 1 and seq[2] == seq[1] + 1 and seq[3] == seq[2] + 1:
                raise ValueError("Şifre 4 veya daha fazla ardışık artan rakam içeremez")
            if seq[1] == seq[0] - 1 and seq[2] == seq[1] - 1 and seq[3] == seq[2] - 1:
                raise ValueError("Şifre 4 veya daha fazla ardışık azalan rakam içeremez")


class ManagedUserUpdateRequest(BaseModel):
    username: str | None = Field(None, min_length=1, description="Updated username")
    name: str | None = Field(None, min_length=1, description="Updated full name")
    password: str | None = Field(None, min_length=8, description="New password")
    password_confirm: str | None = Field(None, min_length=8, description="New password confirmation")
    role: ManagedUserRoleType | None = Field(None, description="Atolye role")
    station_id: int | None = Field(None, description="Station ID for operator role")

    @model_validator(mode="after")
    def validate_passwords(self):
        if self.password is not None or self.password_confirm is not None:
            if not self.password or not self.password_confirm:
                raise ValueError("Şifre güncelleme için şifre ve şifre tekrar birlikte girilmelidir")
            _validate_password_strength(self.password)
            if self.password != self.password_confirm:
                raise ValueError("Şifreler eşleşmiyor")
        return self


class WorkOrderLinkDirectoryRequest(BaseModel):
    merkez_dizin: str = Field(..., min_length=1, max_length=1024, description="Merkez dizin (root directory)")


class WorkOrderLinkDirectoryResponse(BaseModel):
    company: str
    merkez_dizin: str | None = None


async def _authenticate_pocketbase_admin(client: httpx.AsyncClient) -> str:
    if not settings.POCKETBASE_ADMIN_EMAIL or not settings.POCKETBASE_ADMIN_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="PocketBase yönetici bilgileri yapılandırılmamış"
        )

    auth_response = await client.post(
        f"{settings.POCKETBASE_URL}/api/admins/auth-with-password",
        json={
            "identity": settings.POCKETBASE_ADMIN_EMAIL,
            "password": settings.POCKETBASE_ADMIN_PASSWORD,
        },
    )
    if auth_response.status_code == 404:
        auth_response = await client.post(
            f"{settings.POCKETBASE_URL}/api/admins/auth-with-password",
            json={
                "identity": settings.POCKETBASE_ADMIN_EMAIL,
                "password": settings.POCKETBASE_ADMIN_PASSWORD,
            },
        )

    if auth_response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="PocketBase yönetici kimlik doğrulaması başarısız oldu",
        )

    token = auth_response.json().get("token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="PocketBase kimlik doğrulama token'ı alınamadı",
        )
    return token


def _extract_atolye_role(role_values: list[str] | None) -> ManagedUserRoleType | None:
    if not role_values:
        return None
    for role in role_values:
        if isinstance(role, str) and role.startswith("atolye:"):
            role_name = role.split(":", 1)[1]
            try:
                return ManagedUserRoleType(role_name)
            except ValueError:
                continue
    return None


def _extract_musteri_company_from_roles(role_values: list[str] | None) -> str | None:
    """
    Extracts musteri company from supplemental role:
    - atolye:musteri_company:<company>
    """
    if not role_values:
        return None
    prefix = "atolye:musteri_company:"
    for role in role_values:
        if isinstance(role, str) and role.startswith(prefix):
            value = role[len(prefix):].strip()
            if value:
                return value
    return None


def _get_main_company_from_department(department: str | None) -> str:
    department_value = (department or "").strip()
    if not department_value:
        return ""
    if ":" in department_value:
        return department_value.split(":", 1)[0].strip()
    return department_value


@router.get("/management/work-order-link-directory", response_model=WorkOrderLinkDirectoryResponse)
async def get_work_order_link_directory(
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """
    Returns the company's configured root directory for work-order file links.
    Available to all atolye roles.
    """
    role_values = current_user.role if current_user.role and isinstance(current_user.role, list) else []
    has_atolye_role = any(
        role in {"atolye:operator", "atolye:yonetici", "atolye:musteri", "atolye:satinalma"}
        for role in role_values
    )
    if not has_atolye_role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Atölye yetkisi gereklidir",
        )

    company = _get_main_company_from_department(current_user.department)
    if not company:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Kullanıcı şirket bilgisi bulunamadı",
        )

    result = await romiot_db.execute(
        select(WorkOrderLinkDirectory).where(WorkOrderLinkDirectory.company == company)
    )
    setting = result.scalar_one_or_none()

    return WorkOrderLinkDirectoryResponse(
        company=company,
        merkez_dizin=setting.root_directory if setting else None,
    )


@router.put("/management/work-order-link-directory", response_model=WorkOrderLinkDirectoryResponse)
async def upsert_work_order_link_directory(
    data: WorkOrderLinkDirectoryRequest,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """
    Saves company's root directory for work-order file links.
    Requires yonetici role.
    """
    user_company = await check_station_yonetici_role(current_user)
    normalized_directory = data.merkez_dizin.strip()
    if not normalized_directory:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Merkez dizin boş olamaz",
        )

    result = await romiot_db.execute(
        select(WorkOrderLinkDirectory).where(WorkOrderLinkDirectory.company == user_company)
    )
    setting = result.scalar_one_or_none()

    if not setting:
        setting = WorkOrderLinkDirectory(
            company=user_company,
            root_directory=normalized_directory,
        )
        romiot_db.add(setting)
    else:
        setting.root_directory = normalized_directory

    await romiot_db.commit()

    return WorkOrderLinkDirectoryResponse(
        company=user_company,
        merkez_dizin=setting.root_directory,
    )


@router.get("/management/users", response_model=list[ManagedUserResponse])
async def list_company_users(
    current_user: User = Depends(check_authenticated),
    postgres_db: AsyncSession = Depends(get_postgres_db),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """
    List users in the current yonetici's company (department).
    Includes the yonetici user as well.
    """
    user_company = await check_station_yonetici_role(current_user)

    try:
        async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
            auth_token = await _authenticate_pocketbase_admin(client)
            headers = {"Authorization": auth_token}

            all_pb_users: list[dict] = []
            page = 1
            total_pages = 1
            while page <= total_pages:
                response = await client.get(
                    f"{settings.POCKETBASE_URL}/api/collections/users/records",
                    params={
                        "perPage": 200,
                        "page": page,
                        "sort": "name",
                    },
                    headers=headers,
                )
                if response.status_code != 200:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Kullanıcı listesi PocketBase'den alınamadı",
                    )

                payload = response.json()
                items = payload.get("items", [])
                for item in items:
                    department = (item.get("department") or "").strip()
                    if department == user_company or department.startswith(f"{user_company}:"):
                        all_pb_users.append(item)
                total_pages = payload.get("totalPages", 1) or 1
                page += 1
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Kullanıcılar alınırken hata oluştu: {str(e)}",
        )

    usernames = [
        u.get("username")
        for u in all_pb_users
        if isinstance(u.get("username"), str) and u.get("username")
    ]

    pg_users_by_username: dict[str, PostgresUser] = {}
    if usernames:
        pg_users_result = await postgres_db.execute(
            select(PostgresUser).where(PostgresUser.username.in_(usernames))
        )
        pg_users = pg_users_result.scalars().all()
        pg_users_by_username = {u.username: u for u in pg_users}

    stations_result = await romiot_db.execute(
        select(Station).where(Station.company == user_company)
    )
    stations = stations_result.scalars().all()
    station_name_by_id = {s.id: s.name for s in stations}

    response_items: list[ManagedUserResponse] = []
    for pb_user in all_pb_users:
        username = pb_user.get("username", "")
        pg_user = pg_users_by_username.get(username)
        station_id = pg_user.workshop_id if pg_user else None
        station_name = station_name_by_id.get(station_id) if station_id else None
        extracted_role = _extract_atolye_role(pb_user.get("role"))

        response_items.append(
            ManagedUserResponse(
                pocketbase_id=pb_user.get("id", ""),
                username=username,
                name=pb_user.get("name"),
                email=pb_user.get("email"),
                role=extracted_role,
                station_id=station_id,
                station_name=station_name,
                company=user_company,
                is_self=username == current_user.username,
            )
        )

    return response_items


@router.put("/management/users/{pocketbase_user_id}", response_model=ManagedUserResponse)
async def update_company_user(
    pocketbase_user_id: str,
    user_data: ManagedUserUpdateRequest,
    current_user: User = Depends(check_authenticated),
    postgres_db: AsyncSession = Depends(get_postgres_db),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """
    Update a company user's username, password, name, role and station assignment.
    """
    user_company = await check_station_yonetici_role(current_user)

    try:
        async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
            auth_token = await _authenticate_pocketbase_admin(client)
            headers = {"Authorization": auth_token}

            # Fetch target user to verify ownership (department scope)
            target_response = await client.get(
                f"{settings.POCKETBASE_URL}/api/collections/users/records/{pocketbase_user_id}",
                headers=headers,
            )
            if target_response.status_code == 404:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Kullanıcı bulunamadı",
                )
            if target_response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Kullanıcı bilgisi PocketBase'den alınamadı",
                )

            target_pb_user = target_response.json()
            target_department = (target_pb_user.get("department") or "").strip()
            if not (target_department == user_company or target_department.startswith(f"{user_company}:")):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Bu kullanıcı sizin şirketinize ait değil",
                )

            old_username = target_pb_user.get("username", "")
            current_role = _extract_atolye_role(target_pb_user.get("role"))
            new_role = user_data.role or current_role
            if not new_role:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Kullanıcının mevcut atölye rolü bulunamadı",
                )

            # Determine postgres user to update
            pg_user = None
            if old_username:
                pg_user = await UserService.get_user_by_username(postgres_db, old_username)

            # Determine final station assignment
            requested_station_id = user_data.station_id
            station_id_for_db = None
            if new_role == ManagedUserRoleType.OPERATOR:
                station_id_for_db = requested_station_id
                if station_id_for_db is None and pg_user:
                    station_id_for_db = pg_user.workshop_id
                if station_id_for_db is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Operatör rolü için atölye seçilmesi zorunludur",
                    )
            elif requested_station_id is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Yalnızca operatör rolü için atölye seçilebilir",
                )

            if station_id_for_db is not None:
                station_result = await romiot_db.execute(
                    select(Station).where(Station.id == station_id_for_db)
                )
                station = station_result.scalar_one_or_none()
                if not station:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"ID {station_id_for_db} ile atölye bulunamadı",
                    )
                if station.company != user_company:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Bu atölye sizin şirketinize ait değil",
                    )

            new_username = user_data.username or old_username
            if not new_username:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Kullanıcı adı boş olamaz",
                )

            if new_username != old_username:
                # Check if another PB user already has this username
                check_username_response = await client.get(
                    f"{settings.POCKETBASE_URL}/api/collections/users/records",
                    params={"filter": f'username="{new_username}"', "perPage": 1},
                    headers=headers,
                )
                if check_username_response.status_code == 200:
                    existing_items = check_username_response.json().get("items", [])
                    if existing_items and existing_items[0].get("id") != pocketbase_user_id:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"'{new_username}' kullanıcı adı zaten kullanılıyor",
                        )

                existing_pg_user_result = await postgres_db.execute(
                    select(PostgresUser).where(PostgresUser.username == new_username)
                )
                existing_pg_user = existing_pg_user_result.scalar_one_or_none()
                if existing_pg_user and (not pg_user or existing_pg_user.id != pg_user.id):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"'{new_username}' kullanıcı adı zaten kullanılıyor",
                    )

            department_for_payload = user_company
            existing_role_values = target_pb_user.get("role") if isinstance(target_pb_user.get("role"), list) else []
            pb_roles = [f"atolye:{new_role.value}"]
            if new_role == ManagedUserRoleType.MUSTERI:
                musteri_company = _extract_musteri_company_from_roles(existing_role_values)
                if not musteri_company and target_department.startswith(f"{user_company}:"):
                    # Backward compatibility for previously saved department format XXX:YYY
                    musteri_company = target_department.split(":", 1)[1].strip()
                if not musteri_company:
                    # Fallback when converting role without explicit musteri company input
                    musteri_company = user_company
                pb_roles.append(f"atolye:musteri_company:{musteri_company}")

            pb_payload: dict = {
                "username": new_username,
                "name": user_data.name if user_data.name is not None else target_pb_user.get("name", ""),
                "role": pb_roles,
                "department": department_for_payload,
                "company": user_company,
            }
            if user_data.password:
                pb_payload["password"] = user_data.password
                pb_payload["passwordConfirm"] = user_data.password_confirm

            update_pb_response = await client.patch(
                f"{settings.POCKETBASE_URL}/api/collections/users/records/{pocketbase_user_id}",
                json=pb_payload,
                headers=headers,
            )
            if update_pb_response.status_code not in (200, 201):
                error_detail = update_pb_response.text
                try:
                    error_json = update_pb_response.json()
                    error_message = error_json.get("message", error_detail)
                except Exception:
                    error_message = error_detail
                raise HTTPException(
                    status_code=update_pb_response.status_code,
                    detail=f"Kullanıcı PocketBase üzerinde güncellenemedi: {error_message}",
                )

            # Update / create postgres user mirror
            if not pg_user:
                pg_user = PostgresUser(
                    username=new_username,
                    name=pb_payload.get("name"),
                    workshop_id=station_id_for_db,
                )
                postgres_db.add(pg_user)
            else:
                pg_user.username = new_username
                if pb_payload.get("name") is not None:
                    pg_user.name = pb_payload.get("name")
                pg_user.workshop_id = station_id_for_db

            await postgres_db.commit()
            await postgres_db.refresh(pg_user)

            station_name = None
            if pg_user.workshop_id:
                station_result = await romiot_db.execute(
                    select(Station).where(Station.id == pg_user.workshop_id)
                )
                station_obj = station_result.scalar_one_or_none()
                station_name = station_obj.name if station_obj else None

            return ManagedUserResponse(
                pocketbase_id=pocketbase_user_id,
                username=new_username,
                name=pb_payload.get("name"),
                email=target_pb_user.get("email"),
                role=new_role,
                station_id=pg_user.workshop_id,
                station_name=station_name,
                company=user_company,
                is_self=new_username == current_user.username,
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Kullanıcı güncellenirken hata oluştu: {str(e)}",
        )


@router.post("/", response_model=StationSchema, status_code=status.HTTP_201_CREATED)
async def create_station(
    station_data: StationCreate,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db)
):
    """
    Create a new station.
    Requires role 'atolye:yonetici' and department matching the station's company.
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
    Requires role 'atolye:operator'.
    """
    # Check if user has operator role
    from app.api.v1.endpoints.romiot.station.auth import check_station_operator_role
    from app.api.v1.endpoints.romiot.station.auth import get_station_company
    
    # Verify user has operator role
    has_operator_role = False
    if current_user.role and isinstance(current_user.role, list):
        for role in current_user.role:
            if isinstance(role, str) and role == "atolye:operator":
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
    Requires role 'atolye:yonetici', 'atolye:operator', or 'atolye:musteri'.
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
    password: str = Field(..., min_length=8, description="Password")
    password_confirm: str = Field(..., description="Password confirmation")
    musteri_department: str | None = Field(None, min_length=1, description="Müşteri alt departman/şirket")
    station_id: int | None = Field(None, description="Station ID (required for operator, not for musteri)")
    role: UserRoleType = Field(..., description="Role: musteri or operator")

    @model_validator(mode='after')
    def validate_data(self):
        # Check password strength
        _validate_password_strength(self.password)
        # Check password match
        if self.password != self.password_confirm:
            raise ValueError('Şifreler eşleşmiyor')
        
        # Station ID is required for operator role
        if self.role == UserRoleType.OPERATOR and not self.station_id:
            raise ValueError('Operatör rolü için atölye seçilmesi zorunludur')
        
        # Station ID should not be provided for musteri role
        if self.role == UserRoleType.MUSTERI and self.station_id is not None:
            raise ValueError('Müşteri rolü için atölye seçilmemelidir')

        # Musteri department is required for musteri role
        if self.role == UserRoleType.MUSTERI and not self.musteri_department:
            raise ValueError('Müşteri rolü için şirket/departman bilgisi zorunludur')
        if self.role == UserRoleType.OPERATOR and self.musteri_department is not None:
            raise ValueError('Operatör rolü için müşteri şirket/departman bilgisi gönderilmemelidir')
        
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
    Requires role 'atolye:yonetici'.
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

    # Construct the role with the new format: "atolye:<role>"
    full_role = f"atolye:{user_data.role.value}"

    # Department mapping:
    # - all roles keep main company in department
    # - musteri-specific company is stored in an extra role
    target_department = user_company
    role_values = [full_role]
    if user_data.role == UserRoleType.MUSTERI:
        musteri_department = (user_data.musteri_department or "").strip()
        if ":" in musteri_department:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Müşteri şirket/departman bilgisinde ':' karakteri kullanılamaz"
            )
        role_values.append(f"atolye:musteri_company:{musteri_department}")

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
                        f"{settings.POCKETBASE_URL}/api/admins/auth-with-password",
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
                "role": role_values,
                "department": target_department,
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
        "department": target_department,
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
    Requires role 'atolye:yonetici' and department matching the station's company.
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
    Requires role 'atolye:yonetici' and department matching the station's company.
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
    Requires role 'atolye:yonetici' and department matching the station's company.
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
    Requires role 'atolye:yonetici'.
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
    Requires role 'atolye:yonetici'.
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
