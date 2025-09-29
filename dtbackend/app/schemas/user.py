from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, Dict, Any, List
from datetime import datetime


class RoleAction(BaseModel):
    actions: List[str]
    department: str

class SensorRole(BaseModel):
    general: List[RoleAction]
    sensors: List[Any] = []

class ZimmetEquipment(BaseModel):
    authority: List[str]
    mspe: str

class ZimmetRole(BaseModel):
    equipments: List[ZimmetEquipment]
    general: List[RoleAction]

class IhsMarketRole(BaseModel):
    actions: List[str]

class UserRole(BaseModel):
    role: List[str]

class UserBase(BaseModel):
    username: str
    email: str = Field(alias='email')
    name: str
    company: str
    department: str
    management_dpt: str = Field(alias='managementDpt')
    title: str
    avatar_url: Optional[str] = Field(alias='avatar_url', default=None)
    role: List[str]


class UserCreate(UserBase):
    pass


class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None
    company: Optional[str] = None
    department: Optional[str] = None
    management_dpt: Optional[str] = None
    title: Optional[str] = None
    avatar_url: Optional[str] = None
    role: Optional[List[str]] = None


class User(UserBase):
    id: str
    created: Optional[datetime] = None
    updated: Optional[datetime] = None
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
            avatar_url=user_data.get("avatar_url", ""),
            role=user_data.get("role", []),
            created=created,
            updated=updated,
            verified=user_data.get("verified", False)
        )


class LoginRedirectRequest(BaseModel):
    tokens: str
    secret: str
    client_redirect: Optional[str] = None


class LoginRedirectResponse(BaseModel):
    access_token: str
    refresh_token: str
    redirect_url: str


class AuthTokens(BaseModel):
    access_token: str
    refresh_token: str
