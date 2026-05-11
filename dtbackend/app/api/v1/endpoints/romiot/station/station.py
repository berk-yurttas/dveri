import re
from enum import Enum

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field, model_validator
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.romiot.station.auth import check_station_yonetici_role, is_full_admin
from app.core.auth import check_authenticated
from app.core.config import settings
from app.core.database import get_postgres_db, get_romiot_db
from app.models.postgres_models import User as PostgresUser
from app.models.romiot_models import CompanyIntegration, Station, WorkOrderLinkDirectory
from app.schemas.station import Station as StationSchema
from app.schemas.station import StationCreate, StationList
from app.schemas.user import User
from app.services.user_service import UserService

router = APIRouter()


class UserRoleType(str, Enum):
    """Roles the legacy /user endpoint accepts. Müşteri lives on /management/users now."""
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
    department: str | None = None
    musteri_companies: list[str] = []
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
    company: str | None = Field(
        None,
        description="Deprecated: ignored on input. Backend writes company = department.",
    )
    department: str | None = Field(None, min_length=1, description="Müşteri's customer name (fullAdmin only)")
    musteri_companies: list[str] | None = Field(
        None,
        description="Replacement target workshops for müşteri (fullAdmin only). When supplied, replaces every atolye:musteri_company:* entry.",
    )

    @model_validator(mode="after")
    def validate_request(self):
        if self.password is not None or self.password_confirm is not None:
            if not self.password or not self.password_confirm:
                raise ValueError("Şifre güncelleme için şifre ve şifre tekrar birlikte girilmelidir")
            _validate_password_strength(self.password)
            if self.password != self.password_confirm:
                raise ValueError("Şifreler eşleşmiyor")
        if self.department is not None and ":" in self.department:
            raise ValueError("Müşteri adında ':' karakteri kullanılamaz")
        if self.musteri_companies is not None:
            for value in self.musteri_companies:
                if not isinstance(value, str) or not value.strip() or ":" in value:
                    raise ValueError("Geçersiz hedef atölye değeri")
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


def _extract_musteri_companies_from_roles(role_values: list[str] | None) -> list[str]:
    """
    Extracts the list of müşteri companies from supplemental roles:
    - atolye:musteri_company:<company>

    Order-preserving and deduplicated.
    """
    if not role_values:
        return []
    prefix = "atolye:musteri_company:"
    companies: list[str] = []
    seen: set[str] = set()
    for role in role_values:
        if isinstance(role, str) and role.startswith(prefix):
            value = role[len(prefix):].strip()
            if value and value not in seen:
                seen.add(value)
                companies.append(value)
    return companies


def _get_main_company_from_department(department: str | None) -> str:
    department_value = (department or "").strip()
    if not department_value:
        return ""
    if ":" in department_value:
        return department_value.split(":", 1)[0].strip()
    return department_value


async def _pb_create_user_record(
    *,
    username: str,
    email: str,
    password: str,
    password_confirm: str,
    name: str,
    role: list[str],
    department: str,
    company: str,
) -> str:
    """
    Authenticate as PB admin, ensure username/email are unique, create the user
    record, and return the new PB id. Raises HTTPException with PB-derived
    detail on validation/uniqueness errors.
    """
    async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
        auth_token = await _authenticate_pocketbase_admin(client)
        headers = {"Authorization": auth_token}

        check_username = await client.get(
            f"{settings.POCKETBASE_URL}/api/collections/users/records",
            params={"filter": f'username="{username}"'},
            headers=headers,
        )
        if check_username.status_code == 200 and check_username.json().get("items"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"'{username}' kullanıcı adı zaten kullanılıyor",
            )

        check_email = await client.get(
            f"{settings.POCKETBASE_URL}/api/collections/users/records",
            params={"filter": f'email="{email}"'},
            headers=headers,
        )
        if check_email.status_code == 200 and check_email.json().get("items"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"'{email}' e-posta adresi zaten kullanılıyor",
            )

        payload = {
            "username": username,
            "email": email,
            "emailVisibility": True,
            "verified": True,
            "password": password,
            "passwordConfirm": password_confirm,
            "name": name,
            "role": role,
            "department": department,
            "company": company,
        }
        create_response = await client.post(
            f"{settings.POCKETBASE_URL}/api/collections/users/records",
            json=payload,
            headers=headers,
        )
        if create_response.status_code in (200, 201):
            return create_response.json().get("id", "")

        # Best-effort error parsing (mirrors today's logic)
        error_detail = create_response.text
        try:
            error_json = create_response.json()
            error_data = error_json.get("data", {}) or {}
            email_errors = error_data.get("email")
            if isinstance(email_errors, dict) and "message" in email_errors:
                msg = str(email_errors["message"]).lower()
                if "already exists" in msg or "already in use" in msg:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"'{email}' e-posta adresi zaten kullanılıyor",
                    )
                if "invalid" in msg or "format" in msg:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Geçersiz e-posta adresi formatı",
                    )
            username_errors = error_data.get("username")
            if isinstance(username_errors, dict) and "message" in username_errors:
                msg = str(username_errors["message"]).lower()
                if "already exists" in msg:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"'{username}' kullanıcı adı zaten kullanılıyor",
                    )
            error_message = error_json.get("message", error_detail)
        except HTTPException:
            raise
        except Exception:
            error_message = error_detail
        raise HTTPException(
            status_code=create_response.status_code,
            detail=f"Kullanıcı oluşturulurken hata oluştu: {error_message}",
        )


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
    List atolye users.
    - fullAdmin: every user with at least one atolye:* role, across all companies.
    - Yönetici (non-fullAdmin): users whose PB company == yönetici's company,
      excluding any user carrying atolye:musteri.
    """
    full_admin = is_full_admin(current_user)
    if full_admin:
        user_company = None  # not used for filtering
    else:
        user_company = await check_station_yonetici_role(current_user)

    try:
        async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
            auth_token = await _authenticate_pocketbase_admin(client)
            headers = {"Authorization": auth_token}

            all_pb_users: list[dict] = []
            page = 1
            total_pages = 1
            atolye_role_set = {
                "atolye:yonetici",
                "atolye:operator",
                "atolye:musteri",
                "atolye:satinalma",
            }
            while page <= total_pages:
                response = await client.get(
                    f"{settings.POCKETBASE_URL}/api/collections/users/records",
                    params={"perPage": 200, "page": page, "sort": "name"},
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
                    item_role_values = item.get("role") if isinstance(item.get("role"), list) else []
                    has_atolye_role = any(
                        isinstance(r, str) and r in atolye_role_set for r in item_role_values
                    )
                    if not has_atolye_role:
                        continue
                    item_company = (item.get("company") or "").strip()
                    if full_admin:
                        all_pb_users.append(item)
                    else:
                        if item_company != user_company:
                            continue
                        is_musteri = any(
                            isinstance(r, str) and r == "atolye:musteri"
                            for r in item_role_values
                        )
                        if is_musteri:
                            continue
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
        u.get("username") for u in all_pb_users
        if isinstance(u.get("username"), str) and u.get("username")
    ]

    pg_users_by_username: dict[str, PostgresUser] = {}
    if usernames:
        pg_users_result = await postgres_db.execute(
            select(PostgresUser).where(PostgresUser.username.in_(usernames))
        )
        for u in pg_users_result.scalars().all():
            pg_users_by_username[u.username] = u

    workshop_ids = {
        u.workshop_id for u in pg_users_by_username.values() if u.workshop_id is not None
    }
    station_name_by_id: dict[int, str] = {}
    if workshop_ids:
        stations_result = await romiot_db.execute(
            select(Station).where(Station.id.in_(workshop_ids))
        )
        station_name_by_id = {s.id: s.name for s in stations_result.scalars().all()}

    response_items: list[ManagedUserResponse] = []
    for pb_user in all_pb_users:
        username = pb_user.get("username", "")
        pg_user = pg_users_by_username.get(username)
        station_id = pg_user.workshop_id if pg_user else None
        station_name = station_name_by_id.get(station_id) if station_id else None
        extracted_role = _extract_atolye_role(pb_user.get("role"))
        item_company = (pb_user.get("company") or "").strip()

        response_items.append(
            ManagedUserResponse(
                pocketbase_id=pb_user.get("id", ""),
                username=username,
                name=pb_user.get("name"),
                email=pb_user.get("email"),
                role=extracted_role,
                station_id=station_id,
                station_name=station_name,
                company=item_company,
                department=(pb_user.get("department") or "").strip() or None,
                musteri_companies=_extract_musteri_companies_from_roles(pb_user.get("role")),
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
    full_admin = is_full_admin(current_user)
    if full_admin:
        user_company: str | None = None
    else:
        user_company = await check_station_yonetici_role(current_user)

    try:
        async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
            auth_token = await _authenticate_pocketbase_admin(client)
            headers = {"Authorization": auth_token}

            target_response = await client.get(
                f"{settings.POCKETBASE_URL}/api/collections/users/records/{pocketbase_user_id}",
                headers=headers,
            )
            if target_response.status_code == 404:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kullanıcı bulunamadı")
            if target_response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Kullanıcı bilgisi PocketBase'den alınamadı",
                )

            target_pb_user = target_response.json()
            existing_role_values = (
                target_pb_user.get("role") if isinstance(target_pb_user.get("role"), list) else []
            )
            existing_company = (target_pb_user.get("company") or "").strip()
            existing_department = (target_pb_user.get("department") or "").strip()
            target_is_musteri = any(
                isinstance(r, str) and r == "atolye:musteri" for r in existing_role_values
            )

            if not full_admin:
                if existing_company != user_company:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Bu kullanıcı sizin şirketinize ait değil",
                    )
                if target_is_musteri:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Bu kullanıcı türünü düzenleme yetkiniz yok",
                    )

            old_username = target_pb_user.get("username", "")
            current_role = _extract_atolye_role(existing_role_values)
            new_role = user_data.role or current_role
            if not new_role:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Kullanıcının mevcut atölye rolü bulunamadı",
                )

            if not full_admin and new_role == ManagedUserRoleType.MUSTERI:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Müşteri rolüne dönüştürme yetkiniz yok",
                )

            # Firma (department) = effective company; mirrored to PB company on write.
            # Operators: locked to existing department. Non-operators: editable via user_data.department.
            target_is_operator = any(
                isinstance(r, str) and r == "atolye:operator" for r in existing_role_values
            )
            if full_admin and target_is_operator:
                if user_data.department is not None and user_data.department.strip() != existing_department:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Operatör için Firma bilgisi düzenlenemez",
                    )
                if user_data.role is not None and user_data.role != ManagedUserRoleType.OPERATOR:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Operatöre farklı bir rol atanamaz.",
                    )
                effective_company = existing_department or existing_company
            elif full_admin:
                effective_company = (
                    (user_data.department or existing_department or existing_company).strip()
                )
                if not effective_company:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Firma boş olamaz",
                    )
                if ":" in effective_company:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Firma adında ':' karakteri kullanılamaz",
                    )
            else:
                effective_company = user_company  # type: ignore[assignment]

            # Resolve postgres mirror & station assignment
            pg_user = None
            if old_username:
                pg_user = await UserService.get_user_by_username(postgres_db, old_username)

            requested_station_id = user_data.station_id
            station_id_for_db: int | None = None
            if new_role == ManagedUserRoleType.OPERATOR:
                if requested_station_id is not None:
                    station_id_for_db = requested_station_id
                elif pg_user and pg_user.workshop_id is not None:
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
                if station.company != effective_company:
                    if full_admin and user_data.station_id is None:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Yeni şirkete ait atölye seçilmelidir",
                        )
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=(
                            "Seçilen şirkete ait atölye değil"
                            if full_admin
                            else "Bu atölye sizin şirketinize ait değil"
                        ),
                    )

            new_username = user_data.username or old_username
            if not new_username:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Kullanıcı adı boş olamaz",
                )

            if new_username != old_username:
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

            # Build pb_roles
            pb_roles = [f"atolye:{new_role.value}"]
            if new_role == ManagedUserRoleType.MUSTERI:
                if full_admin and user_data.musteri_companies is not None:
                    seen: set[str] = set()
                    for value in user_data.musteri_companies:
                        norm = value.strip()
                        if norm and norm not in seen:
                            seen.add(norm)
                            pb_roles.append(f"atolye:musteri_company:{norm}")
                else:
                    for role in existing_role_values:
                        if isinstance(role, str) and role.startswith("atolye:musteri_company:"):
                            pb_roles.append(role)

            # Department mirrors Firma. For operators, locked to existing value.
            # For non-operators under fullAdmin, takes user_data.department if supplied; otherwise effective_company.
            if target_is_operator:
                department_for_payload = existing_department or effective_company
            elif full_admin and user_data.department is not None:
                department_for_payload = user_data.department.strip()
            else:
                department_for_payload = effective_company

            pb_payload: dict = {
                "username": new_username,
                "name": user_data.name if user_data.name is not None else target_pb_user.get("name", ""),
                "role": pb_roles,
                "department": department_for_payload,
                "company": department_for_payload,
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
                company=department_for_payload,
                department=department_for_payload,
                musteri_companies=[
                    role.split(":", 2)[2]
                    for role in pb_roles
                    if role.startswith("atolye:musteri_company:")
                ],
                is_self=new_username == current_user.username,
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Kullanıcı güncellenirken hata oluştu: {str(e)}",
        )


class FullAdminUserCreateRequest(BaseModel):
    username: str = Field(..., min_length=1, description="Username")
    name: str = Field(..., min_length=1, description="Full name")
    email: EmailStr = Field(..., description="Email address")
    password: str = Field(..., min_length=8, description="Password")
    password_confirm: str = Field(..., min_length=8, description="Password confirmation")
    role: ManagedUserRoleType = Field(..., description="yonetici / musteri / satinalma (operator rejected by handler)")
    company: str | None = Field(
        None,
        description="Deprecated: ignored on input. Backend writes company = department.",
    )
    department: str = Field(..., min_length=1, description="Firma (saves to PB department; mirrored to PB company)")
    station_id: int | None = Field(None, description="Required for operator role — but operator is rejected by handler")
    musteri_companies: list[str] | None = Field(
        None, description="Optional target firmalar (musteri only)"
    )

    @model_validator(mode="after")
    def validate(self):
        _validate_password_strength(self.password)
        if self.password != self.password_confirm:
            raise ValueError("Şifreler eşleşmiyor")
        if not self.department.strip():
            raise ValueError("Firma boş olamaz")
        if ":" in self.department:
            raise ValueError("Firma adında ':' karakteri kullanılamaz")
        if self.role == ManagedUserRoleType.OPERATOR:
            raise ValueError("Operatör kullanıcıları bu uçtan oluşturulamaz; yönetici sayfasını kullanın.")
        if self.station_id is not None:
            raise ValueError("station_id gönderilmemelidir")
        if self.musteri_companies is not None:
            if self.role != ManagedUserRoleType.MUSTERI:
                raise ValueError("Hedef firmalar sadece müşteri rolü için seçilebilir")
            for value in self.musteri_companies:
                if not isinstance(value, str) or not value.strip() or ":" in value:
                    raise ValueError("Geçersiz hedef firma değeri")
        return self


class BulkMusteriCompaniesMode(str, Enum):
    ADD = "add"
    REPLACE = "replace"


class BulkMusteriCompaniesRequest(BaseModel):
    user_ids: list[str] = Field(..., min_length=1, description="PocketBase user ids to update")
    companies: list[str] = Field(..., description="Target firmalar to apply")
    mode: BulkMusteriCompaniesMode = Field(..., description="add (merge) or replace (overwrite)")

    @model_validator(mode="after")
    def validate_companies(self):
        for c in self.companies:
            if not isinstance(c, str) or not c.strip() or ":" in c:
                raise ValueError("Geçersiz hedef firma değeri")
        return self


@router.post("/management/users", response_model=dict, status_code=status.HTTP_201_CREATED)
async def full_admin_create_user(
    user_data: FullAdminUserCreateRequest,
    current_user: User = Depends(check_authenticated),
    postgres_db: AsyncSession = Depends(get_postgres_db),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """
    Create any atolye user. fullAdmin-only.
    """
    if not is_full_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="fullAdmin yetkisi gereklidir",
        )

    # Firma = department (mirrored to company on the PB record)
    firma = user_data.department.strip()
    if not firma:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Firma boş olamaz",
        )

    existing_pg_result = await postgres_db.execute(
        select(PostgresUser).where(PostgresUser.username == user_data.username)
    )
    if existing_pg_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"'{user_data.username}' kullanıcı adı zaten kullanılıyor",
        )

    role_values = [f"atolye:{user_data.role.value}"]
    if user_data.role == ManagedUserRoleType.MUSTERI and user_data.musteri_companies:
        seen: set[str] = set()
        for value in user_data.musteri_companies:
            norm = value.strip()
            if norm and norm not in seen:
                seen.add(norm)
                role_values.append(f"atolye:musteri_company:{norm}")

    try:
        pb_user_id = await _pb_create_user_record(
            username=user_data.username,
            email=user_data.email,
            password=user_data.password,
            password_confirm=user_data.password_confirm,
            name=user_data.name,
            role=role_values,
            department=firma,
            company=firma,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PocketBase'de kullanıcı oluşturulurken hata oluştu: {str(e)}",
        )

    new_user = PostgresUser(
        username=user_data.username,
        name=user_data.name,
        workshop_id=None,
    )
    postgres_db.add(new_user)
    await postgres_db.commit()
    await postgres_db.refresh(new_user)

    return {
        "id": new_user.id,
        "pocketbase_id": pb_user_id,
        "username": new_user.username,
        "name": new_user.name,
        "email": user_data.email,
        "role": role_values[0],
        "company": firma,
        "department": firma,
        "station_id": None,
        "musteri_companies": user_data.musteri_companies or [],
    }


@router.patch("/management/users/bulk-musteri-companies", response_model=dict)
async def bulk_musteri_companies(
    payload: BulkMusteriCompaniesRequest,
    current_user: User = Depends(check_authenticated),
):
    """
    Bulk update target firmalar (atolye:musteri_company:*) for multiple müşteri users.
    fullAdmin-only. Returns per-user succeeded/failed lists.
    """
    if not is_full_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="fullAdmin yetkisi gereklidir",
        )

    # Dedupe + normalize the requested companies
    seen: set[str] = set()
    normalized: list[str] = []
    for c in payload.companies:
        n = c.strip()
        if n and n not in seen:
            seen.add(n)
            normalized.append(n)

    succeeded: list[str] = []
    failed: list[dict] = []

    async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
        auth_token = await _authenticate_pocketbase_admin(client)
        headers = {"Authorization": auth_token}

        for user_id in payload.user_ids:
            try:
                get_resp = await client.get(
                    f"{settings.POCKETBASE_URL}/api/collections/users/records/{user_id}",
                    headers=headers,
                )
                if get_resp.status_code != 200:
                    failed.append({"id": user_id, "detail": "Kullanıcı bulunamadı"})
                    continue

                pb_user = get_resp.json()
                role_values = pb_user.get("role") if isinstance(pb_user.get("role"), list) else []
                if "atolye:musteri" not in role_values:
                    failed.append({"id": user_id, "detail": "Müşteri olmayan kullanıcı atlandı"})
                    continue

                non_company_roles = [
                    r for r in role_values
                    if not (isinstance(r, str) and r.startswith("atolye:musteri_company:"))
                ]

                if payload.mode == BulkMusteriCompaniesMode.REPLACE:
                    targets = list(normalized)
                else:  # ADD
                    existing_targets = [
                        r.split(":", 2)[2]
                        for r in role_values
                        if isinstance(r, str) and r.startswith("atolye:musteri_company:")
                    ]
                    seen_local: set[str] = set()
                    targets = []
                    for t in (*existing_targets, *normalized):
                        if t and t not in seen_local:
                            seen_local.add(t)
                            targets.append(t)

                new_role_list = [*non_company_roles] + [
                    f"atolye:musteri_company:{t}" for t in targets
                ]

                patch_resp = await client.patch(
                    f"{settings.POCKETBASE_URL}/api/collections/users/records/{user_id}",
                    json={"role": new_role_list},
                    headers=headers,
                )
                if patch_resp.status_code in (200, 201):
                    succeeded.append(user_id)
                else:
                    failed.append({"id": user_id, "detail": f"PocketBase güncelleme hatası ({patch_resp.status_code})"})
            except Exception as e:
                failed.append({"id": user_id, "detail": str(e) or e.__class__.__name__})

    return {"succeeded": succeeded, "failed": failed}


@router.get("/management/companies", response_model=list[str])
async def list_known_companies(
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """
    Distinct list of companies that have at least one Station record.
    Feeds the fullAdmin user-management dropdowns. fullAdmin-only.
    """
    if not is_full_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="fullAdmin yetkisi gereklidir",
        )
    result = await romiot_db.execute(
        select(Station.company).distinct().order_by(Station.company)
    )
    return [row[0] for row in result.all() if row[0]]


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
        is_exit_station=station_data.is_exit_station,
        station_order_code=station_data.station_order_code,
    )

    romiot_db.add(new_station)
    await romiot_db.commit()
    await romiot_db.refresh(new_station)

    # Auto-create CompanyIntegration record if not already present
    integration_result = await romiot_db.execute(
        select(CompanyIntegration).where(CompanyIntegration.company == station_data.company)
    )
    if not integration_result.scalar_one_or_none():
        romiot_db.add(CompanyIntegration(company=station_data.company))
        await romiot_db.commit()

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
    company: str | None = None,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """
    List stations.
    - fullAdmin: returns all stations, or stations for ?company=<name> when supplied.
    - Other atolye roles: scoped to caller's company; ?company is ignored.
    """
    if is_full_admin(current_user):
        stmt = select(Station)
        if company:
            stmt = stmt.where(Station.company == company)
        stations_result = await romiot_db.execute(stmt)
        return list(stations_result.scalars().all())

    from app.api.v1.endpoints.romiot.station.auth import get_station_company
    user_company = await get_station_company(current_user)
    stations_result = await romiot_db.execute(
        select(Station).where(Station.company == user_company)
    )
    return list(stations_result.scalars().all())


class UserCreateRequest(BaseModel):
    username: str = Field(..., min_length=1, description="Username")
    name: str = Field(..., min_length=1, description="Full name")
    email: EmailStr = Field(..., description="Email address")
    password: str = Field(..., min_length=8, description="Password")
    password_confirm: str = Field(..., description="Password confirmation")
    musteri_department: str | None = Field(None, min_length=1, description="Müşteri alt departman/şirket")
    station_id: int | None = Field(None, description="Station ID (required for operator, not for musteri)")
    role: UserRoleType = Field(default=UserRoleType.OPERATOR, description="Role: operator")

    @model_validator(mode='after')
    def validate_data(self):
        _validate_password_strength(self.password)
        if self.password != self.password_confirm:
            raise ValueError('Şifreler eşleşmiyor')
        if not self.station_id:
            raise ValueError('Operatör rolü için atölye seçilmesi zorunludur')
        if self.musteri_department is not None:
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

    # Verify station exists and belongs to user_company (always required since role is operator-only)
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

    full_role = f"atolye:{user_data.role.value}"
    role_values = [full_role]
    target_department = user_company

    # Create user in PocketBase via shared helper
    pb_user_id = None
    try:
        pb_user_id = await _pb_create_user_record(
            username=user_data.username,
            email=user_data.email,
            password=user_data.password,
            password_confirm=user_data.password_confirm,
            name=user_data.name,
            role=role_values,
            department=target_department,
            company=user_company,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PocketBase'de kullanıcı oluşturulurken hata oluştu: {str(e)}",
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
    station.station_order_code = station_data.station_order_code

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
