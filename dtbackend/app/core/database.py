from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base
from clickhouse_driver import Client
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
