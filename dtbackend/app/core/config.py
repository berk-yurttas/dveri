import os

from dotenv import load_dotenv
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings

load_dotenv()

class Settings(BaseSettings):
    PROJECT_NAME: str = "Dashboard API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    # CORS
    BACKEND_CORS_ORIGINS: list[str] | str = ["http://localhost:3000", "http://localhost:8080"]

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: str | list[str]) -> list[str] | str:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)

    # PostgreSQL Database (for metadata)
    POSTGRES_SERVER: str = Field(default_factory=lambda: os.getenv("POSTGRES_SERVER", "localhost"))
    POSTGRES_USER: str = Field(default_factory=lambda: os.getenv("POSTGRES_USER", "postgres"))
    POSTGRES_PASSWORD: str = Field(default_factory=lambda: os.getenv("POSTGRES_PASSWORD"))
    POSTGRES_DB: str = Field(default_factory=lambda: os.getenv("POSTGRES_DB", "dt_report"))
    POSTGRES_PORT: int = Field(default_factory=lambda: int(os.getenv("POSTGRES_PORT", "5432")))

    # ClickHouse Database (for dashboard data)
    CLICKHOUSE_HOST: str = Field(default_factory=lambda: os.getenv("CLICKHOUSE_HOST", "localhost"))
    CLICKHOUSE_PORT: int = Field(default_factory=lambda: int(os.getenv("CLICKHOUSE_PORT", "8123")))
    CLICKHOUSE_USER: str = Field(default_factory=lambda: os.getenv("CLICKHOUSE_USER", "default"))
    CLICKHOUSE_PASSWORD: str = Field(default_factory=lambda: os.getenv("CLICKHOUSE_PASSWORD", ""))
    CLICKHOUSE_DB: str = Field(default_factory=lambda: os.getenv("CLICKHOUSE_DB", "default"))

    # RomIOT PostgreSQL Database
    ROMIOT_POSTGRES_SERVER: str = Field(default_factory=lambda: os.getenv("ROMIOT_POSTGRES_SERVER", "localhost"))
    ROMIOT_POSTGRES_USER: str = Field(default_factory=lambda: os.getenv("ROMIOT_POSTGRES_USER", "postgres"))
    ROMIOT_POSTGRES_PASSWORD: str = Field(default_factory=lambda: os.getenv("ROMIOT_POSTGRES_PASSWORD", "postgres"))
    ROMIOT_POSTGRES_DB: str = Field(default_factory=lambda: os.getenv("ROMIOT_POSTGRES_DB", "romiotdb"))
    ROMIOT_POSTGRES_PORT: int = Field(default_factory=lambda: int(os.getenv("ROMIOT_POSTGRES_PORT", "5436")))

    # Otomasyon Database (Port 5412)
    OTOMASYON_DB_HOST: str = Field(default_factory=lambda: os.getenv("OTOMASYON_DB_HOST", "localhost"))
    OTOMASYON_DB_PORT: int = Field(default_factory=lambda: int(os.getenv("OTOMASYON_DB_PORT", "5412")))
    OTOMASYON_DB_NAME: str = Field(default_factory=lambda: os.getenv("OTOMASYON_DB_NAME", "otomasyon_db"))
    OTOMASYON_DB_USER: str = Field(default_factory=lambda: os.getenv("OTOMASYON_DB_USER", "postgres"))
    OTOMASYON_DB_PASSWORD: str = Field(default_factory=lambda: os.getenv("OTOMASYON_DB_PASSWORD", "postgres"))

    # Security
    SECRET_KEY: str = "secret"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Auth Server Configuration
    AUTH_SERVER_URL: str = Field(default_factory=lambda: os.getenv("AUTH_SERVER_URL", "http://localhost:8000"))
    AUTH_SERVER_PROXY_HOST: str = Field(default_factory=lambda: os.getenv("AUTH_SERVER_PROXY_HOST", ""))
    AUTH_SERVER_PROXY_PORT: int = Field(default_factory=lambda: int(os.getenv("AUTH_SERVER_PROXY_PORT", "0")))

    # Cookie Configuration
    COOKIE_DOMAIN: str = Field(default_factory=lambda: os.getenv("COOKIE_DOMAIN", "localhost"))
    CORS_ORIGIN: str = Field(default_factory=lambda: os.getenv("CORS_ORIGIN", "http://localhost:3000"))

    # PocketBase Configuration
    POCKETBASE_URL: str = Field(default_factory=lambda: os.getenv("POCKETBASE_URL", "http://localhost:8090"))
    POCKETBASE_ADMIN_EMAIL: str = Field(default_factory=lambda: os.getenv("furkancilesiz57@gmail.com", ""))
    POCKETBASE_ADMIN_PASSWORD: str = Field(default_factory=lambda: os.getenv("12345678", ""))
    
    # OpenProject Configuration
    OPENPROJECT_URL: str = Field(default_factory=lambda: os.getenv("OPENPROJECT_URL", "http://localhost:8080"))
    OPENPROJECT_API_TOKEN: str = Field(default_factory=lambda: os.getenv("OPENPROJECT_API_TOKEN", ""))
    OPENPROJECT_PROJECT_ID: int = Field(default_factory=lambda: int(os.getenv("OPENPROJECT_PROJECT_ID", "3")))
    OPENPROJECT_COLUMN_QUERY_ID: int = Field(default_factory=lambda: int(os.getenv("OPENPROJECT_COLUMN_QUERY_ID", "30")))

    @property
    def postgres_database_url(self) -> str:
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    @property
    def clickhouse_database_url(self) -> str:
        return f"clickhouse://{self.CLICKHOUSE_USER}:{self.CLICKHOUSE_PASSWORD}@{self.CLICKHOUSE_HOST}:{self.CLICKHOUSE_PORT}/{self.CLICKHOUSE_DB}"

    @property
    def romiot_postgres_database_url(self) -> str:
        return f"postgresql+asyncpg://{self.ROMIOT_POSTGRES_USER}:{self.ROMIOT_POSTGRES_PASSWORD}@{self.ROMIOT_POSTGRES_SERVER}:{self.ROMIOT_POSTGRES_PORT}/{self.ROMIOT_POSTGRES_DB}"

    model_config = {"env_file": ".env", "case_sensitive": True}

settings = Settings()
