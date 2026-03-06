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
    import subprocess
    import os
    
    # Try to find an available SQL Server ODBC driver
    available_drivers = [driver for driver in pyodbc.drivers() if 'SQL Server' in driver]
    
    if not available_drivers:
        # Try to get drivers from odbcinst as fallback
        try:
            result = subprocess.run(['odbcinst', '-q', '-d'], capture_output=True, text=True, check=False)
            if 'ODBC Driver 17 for SQL Server' in result.stdout:
                print("Warning: Driver found via odbcinst but not via pyodbc. Using ODBC Driver 17 for SQL Server.")
                driver = 'ODBC Driver 17 for SQL Server'
            elif 'ODBC Driver 18 for SQL Server' in result.stdout:
                print("Warning: Driver found via odbcinst but not via pyodbc. Using ODBC Driver 18 for SQL Server.")
                driver = 'ODBC Driver 18 for SQL Server'
            else:
                raise Exception(
                    f"No SQL Server ODBC driver found. "
                    f"pyodbc.drivers() returned: {pyodbc.drivers()}. "
                    f"Please ensure ODBC Driver 17 or 18 is installed and ODBCSYSINI environment variable is set."
                )
        except FileNotFoundError:
            raise Exception("No SQL Server ODBC driver found and odbcinst command not available.")
    else:
        # Prefer ODBC Driver 18, then 17, then any available SQL Server driver
        driver = None
        for preferred in ['ODBC Driver 18 for SQL Server', 'ODBC Driver 17 for SQL Server']:
            if preferred in available_drivers:
                driver = preferred
                break
        
        if not driver:
            driver = available_drivers[0]
    
    connection_string = (
        f'DRIVER={{{driver}}};'
        'SERVER=10.60.139.2,1433;'
        'DATABASE=AFLOW;'
        'UID=sa;'
        'PWD=sapass-1'
    )
    
    print(f"Attempting connection with driver: {driver}")
    return pyodbc.connect(connection_string)
