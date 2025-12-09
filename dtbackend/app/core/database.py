from clickhouse_driver import Client
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

from app.core.config import settings

# PostgreSQL (for metadata) - Async
postgres_engine = create_async_engine(
    settings.postgres_database_url,
    echo=True,
    pool_pre_ping=True
)

AsyncSessionLocal = async_sessionmaker(
    postgres_engine,
    class_=AsyncSession,
    expire_on_commit=False
)

# Base class for PostgreSQL models
PostgreSQLBase = declarative_base()

# Dependency to get PostgreSQL database session
async def get_postgres_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

# RomIOT PostgreSQL Database - Async
romiot_postgres_engine = create_async_engine(
    settings.romiot_postgres_database_url,
    echo=True,
    pool_pre_ping=True
)

RomiotAsyncSessionLocal = async_sessionmaker(
    romiot_postgres_engine,
    class_=AsyncSession,
    expire_on_commit=False
)

# Dependency to get RomIOT PostgreSQL database session
async def get_romiot_db():
    async with RomiotAsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

# Dependency to get ClickHouse database connection
def get_clickhouse_db():
    client = Client(
        host=settings.CLICKHOUSE_HOST,
        port=settings.CLICKHOUSE_PORT,
        user=settings.CLICKHOUSE_USER,
        password=settings.CLICKHOUSE_PASSWORD,
        database=settings.CLICKHOUSE_DB
    )
    try:
        yield client
    finally:
        client.disconnect()
