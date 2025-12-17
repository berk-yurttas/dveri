from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class RoleAction(BaseModel):
    actions: list[str]
    department: str

class SensorRole(BaseModel):
    general: list[RoleAction]
    sensors: list[Any] = []

class ZimmetEquipment(BaseModel):
    authority: list[str]
    mspe: str

class ZimmetRole(BaseModel):
    equipments: list[ZimmetEquipment]
    general: list[RoleAction]

class IhsMarketRole(BaseModel):
    actions: list[str]

class UserRole(BaseModel):
    role: list[str]

class UserBase(BaseModel):
    username: str
    email: str = Field(alias='email')
    name: str
    company: str
    department: str
    management_dpt: str = Field(alias='managementDpt')
    title: str
    avatar_url: str | None = Field(alias='avatar_url', default=None)
    role: list[str]


class UserCreate(UserBase):
    pass


class UserUpdate(BaseModel):
    username: str | None = None
    email: str | None = None
    name: str | None = None
    company: str | None = None
    department: str | None = None
    management_dpt: str | None = None
    title: str | None = None
    avatar_url: str | None = None
    role: list[str] | None = None


class User(UserBase):
    id: str
    created: datetime | None = None
    updated: datetime | None = None
    verified: bool = False

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        json_encoders={datetime: lambda dt: dt.isoformat()}
    )

    @classmethod
    def from_jwt_payload(cls, payload: dict) -> "User":
        """Create User instance from auth server response"""

        # Extract user data from the nested structure
        if "user" in payload:
            user_data = payload["user"]
        else:
            user_data = payload

        # Convert datetime strings to datetime objects
        created = datetime.fromisoformat(user_data.get("created").replace("Z", "+00:00")) if user_data.get("created") else None
        updated = datetime.fromisoformat(user_data.get("updated").replace("Z", "+00:00")) if user_data.get("updated") else None

        return cls(
            id=user_data.get("id", ""),
            username=user_data.get("username", ""),
            email=user_data.get("email", ""),
            name=user_data.get("name", ""),
            company=user_data.get("company", ""),
            department=user_data.get("department", ""),
            management_dpt=user_data.get("managementDpt", ""),
            title=user_data.get("title", ""),
            avatar_url=user_data.get("avatarUrl", ""),
            role=user_data.get("role", []),
            created=created,
            updated=updated,
            verified=user_data.get("verified", False)
        )


class LoginRedirectRequest(BaseModel):
    tokens: str
    secret: str
    client_redirect: str | None = None


class LoginRedirectResponse(BaseModel):
    access_token: str
    refresh_token: str
    redirect_url: str


class AuthTokens(BaseModel):
    access_token: str
    refresh_token: str
