"""
Platform Database Connection Factory

Handles database connections for different platforms supporting:
- ClickHouse
- Microsoft SQL Server (MSSQL)
- PostgreSQL
"""

from collections.abc import Generator
from typing import Any

#import pyodbc
import psycopg2
from clickhouse_driver import Client as ClickHouseClient
from psycopg2.extras import RealDictCursor

from app.models.postgres_models import Platform


class DatabaseConnectionFactory:
    """Factory class for creating database connections based on platform configuration"""

    @staticmethod
    def get_connection_string(platform: Platform) -> str:
        """
        Build connection string from platform db_config

        Args:
            platform: Platform model instance with db_config

        Returns:
            Connection string for the database
        """
        if not platform.db_config:
            raise ValueError(f"No database configuration found for platform: {platform.code}")

        db_config = platform.db_config

        # If connection_string is provided directly, use it
        if "connection_string" in db_config:
            return db_config["connection_string"]

        # Otherwise, build from components
        db_type = platform.db_type.lower()
        host = db_config.get("host", "localhost")
        port = db_config.get("port")
        database = db_config.get("database")
        user = db_config.get("user")
        password = db_config.get("password")

        if db_type == "clickhouse":
            port = port or 9000
            return f"clickhouse://{user}:{password}@{host}:{port}/{database}"

        elif db_type == "mssql":
            port = port or 1433
            driver = db_config.get("driver", "ODBC Driver 17 for SQL Server")
            return f"DRIVER={{{driver}}};SERVER={host},{port};DATABASE={database};UID={user};PWD={password}"

        elif db_type == "postgresql":
            port = port or 5432
            return f"postgresql://{user}:{password}@{host}:{port}/{database}"

        else:
            raise ValueError(f"Unsupported database type: {db_type}")

    @staticmethod
    def get_clickhouse_client(platform: Platform) -> ClickHouseClient:
        """
        Create ClickHouse client for platform

        Args:
            platform: Platform model instance

        Returns:
            ClickHouse Client instance
        """
        if platform.db_type.lower() != "clickhouse":
            raise ValueError(f"Platform {platform.code} is not configured for ClickHouse")

        db_config = platform.db_config or {}

        client = ClickHouseClient(
            host=db_config.get("host", "localhost"),
            port=int(db_config.get("port", 9000)),
            user=db_config.get("user", "default"),
            password=db_config.get("password", ""),
            database=db_config.get("database", "default"),
            settings=db_config.get("settings", {})
        )

        return client

    # @staticmethod
    # def get_mssql_connection(platform: Platform) -> pyodbc.Connection:
    #     """
    #     Create MSSQL connection for platform

    #     Args:
    #         platform: Platform model instance

    #     Returns:
    #         pyodbc Connection instance
    #     """
    #     if platform.db_type.lower() != "mssql":
    #         raise ValueError(f"Platform {platform.code} is not configured for MSSQL")

    #     connection_string = DatabaseConnectionFactory.get_connection_string(platform)
    #     return pyodbc.connect(connection_string)

    @staticmethod
    def get_postgresql_connection(platform: Platform) -> psycopg2.extensions.connection:
        """
        Create PostgreSQL connection for platform

        Args:
            platform: Platform model instance

        Returns:
            psycopg2 connection instance
        """
        if platform.db_type.lower() != "postgresql":
            raise ValueError(f"Platform {platform.code} is not configured for PostgreSQL")

        db_config = platform.db_config or {}

        conn = psycopg2.connect(
            host=db_config.get("host", "localhost"),
            port=int(db_config.get("port", 5432)),
            database=db_config.get("database"),
            user=db_config.get("user"),
            password=db_config.get("password"),
            cursor_factory=RealDictCursor
        )

        return conn

    @staticmethod
    def execute_query(platform: Platform, query: str, params: dict | None = None) -> dict:
        """
        Execute query on platform database and return results

        Args:
            platform: Platform model instance
            query: SQL query to execute
            params: Optional query parameters

        Returns:
            Dictionary with columns and data
            {
                "columns": ["col1", "col2", ...],
                "data": [[val1, val2, ...], ...],
                "row_count": int
            }
        """
        db_type = platform.db_type.lower()

        if db_type == "clickhouse":
            return DatabaseConnectionFactory._execute_clickhouse(platform, query, params)
        elif db_type == "mssql":
            return DatabaseConnectionFactory._execute_mssql(platform, query, params)
        elif db_type == "postgresql":
            return DatabaseConnectionFactory._execute_postgresql(platform, query, params)
        else:
            raise ValueError(f"Unsupported database type: {db_type}")

    @staticmethod
    def _execute_clickhouse(platform: Platform, query: str, params: dict | None = None) -> dict:
        """Execute ClickHouse query"""
        client = DatabaseConnectionFactory.get_clickhouse_client(platform)

        try:
            result = client.execute(query, params or {}, with_column_types=True)

            # result is a tuple: (data, [(column_name, column_type), ...])
            data = result[0] if isinstance(result, tuple) else result
            columns = [col[0] for col in result[1]] if len(result) > 1 else []

            return {
                "columns": columns,
                "data": [list(row) for row in data],
                "row_count": len(data)
            }
        finally:
            client.disconnect()

    @staticmethod
    def _execute_mssql(platform: Platform, query: str, params: dict | None = None) -> dict:
        """Execute MSSQL query"""
        conn = DatabaseConnectionFactory.get_mssql_connection(platform)
        cursor = conn.cursor()

        try:
            if params:
                cursor.execute(query, params)
            else:
                cursor.execute(query)

            columns = [column[0] for column in cursor.description]
            data = [list(row) for row in cursor.fetchall()]

            return {
                "columns": columns,
                "data": data,
                "row_count": len(data)
            }
        finally:
            cursor.close()
            conn.close()

    @staticmethod
    def _execute_postgresql(platform: Platform, query: str, params: dict | None = None) -> dict:
        """Execute PostgreSQL query"""
        conn = DatabaseConnectionFactory.get_postgresql_connection(platform)
        cursor = conn.cursor()

        try:
            cursor.execute(query, params or {})

            columns = [desc[0] for desc in cursor.description]
            data = [list(row.values()) for row in cursor.fetchall()]

            return {
                "columns": columns,
                "data": data,
                "row_count": len(data)
            }
        finally:
            cursor.close()
            conn.close()


# Dependency injection for FastAPI
def get_platform_db_client(platform: Platform) -> Generator[Any, None, None]:
    """
    FastAPI dependency to get database client for a platform

    Usage in endpoints:
        @router.get("/data")
        async def get_data(
            platform: Platform = Depends(get_current_platform),
            db_client = Depends(get_platform_db_client)
        ):
            # Use db_client based on platform configuration
            pass
    """
    db_type = platform.db_type.lower()

    if db_type == "clickhouse":
        client = DatabaseConnectionFactory.get_clickhouse_client(platform)
        try:
            yield client
        finally:
            client.disconnect()

    elif db_type == "mssql":
        conn = DatabaseConnectionFactory.get_mssql_connection(platform)
        try:
            yield conn
        finally:
            conn.close()

    elif db_type == "postgresql":
        conn = DatabaseConnectionFactory.get_postgresql_connection(platform)
        try:
            yield conn
        finally:
            conn.close()

    else:
        raise ValueError(f"Unsupported database type: {db_type}")

