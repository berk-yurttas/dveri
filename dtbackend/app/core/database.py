import os
from clickhouse_driver import Client
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

from app.core.config import settings

# Ensure ODBC can find configuration on Linux
if not os.environ.get('ODBCSYSINI'):
    os.environ['ODBCSYSINI'] = '/etc'

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

# AFLOW MSSQL Connection
def get_aflow_connection():
    import pyodbc
    
    # Ensure ODBC environment is set for this connection
    os.environ['ODBCSYSINI'] = '/etc'
    
    # List of drivers to try in order
    drivers_to_try = [
        'ODBC Driver 18 for SQL Server',
        'ODBC Driver 17 for SQL Server',
    ]
    
    # Try to auto-detect drivers first
    try:
        available_drivers = [d for d in pyodbc.drivers() if 'SQL Server' in d]
        if available_drivers:
            print(f"Available SQL Server drivers: {available_drivers}")
            # Prefer the ones in our list
            for preferred in drivers_to_try:
                if preferred in available_drivers:
                    drivers_to_try = [preferred]
                    break
    except Exception as e:
        print(f"Warning: Could not auto-detect drivers: {e}")
    
    # Try each driver in order
    last_error = None
    for driver in drivers_to_try:
        try:
            connection_string = (
                f'DRIVER={{{driver}}};'
                'SERVER=10.60.139.2,1433;'
                'DATABASE=AFLOW;'
                'UID=sa;'
                'PWD=sapass-1;'
                'TrustServerCertificate=yes;'
            )
            print(f"Attempting connection with driver: {driver}")
            conn = pyodbc.connect(connection_string)
            print(f"✓ Successfully connected with driver: {driver}")
            return conn
        except pyodbc.Error as e:
            print(f"Failed with driver '{driver}': {e}")
            last_error = e
            continue
    
    # If all drivers failed, raise the last error
    if last_error:
        raise Exception(
            f"Failed to connect to SQL Server with any available driver. "
            f"Last error: {last_error}. "
            f"Tried drivers: {drivers_to_try}. "
            f"Please ensure ODBC Driver 17 or 18 is properly installed on Linux."
        )
    else:
        raise Exception("No SQL Server ODBC drivers available to try.")
