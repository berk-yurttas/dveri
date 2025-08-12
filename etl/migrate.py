import pymssql
import clickhouse_connect
import os
from typing import Dict, List, Tuple, Any
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class DatabaseMigrator:
    def __init__(self):
        self.mssql_conn = None
        self.clickhouse_client = None
        
        self.type_mapping = {
            'int': 'Int32',
            'bigint': 'Int64',
            'smallint': 'Int16',
            'tinyint': 'UInt8',
            'bit': 'UInt8',
            'decimal': 'Decimal64(2)',
            'numeric': 'Decimal64(2)',
            'money': 'Decimal64(4)',
            'smallmoney': 'Decimal32(4)',
            'float': 'Float64',
            'real': 'Float32',
            'datetime': 'DateTime',
            'datetimeoffset': 'DateTime64(3)',
            'datetime2': 'DateTime64(3)',
            'smalldatetime': 'DateTime',
            'date': 'Date',
            'time': 'String',
            'char': 'FixedString',
            'varchar': 'String',
            'text': 'String',
            'nchar': 'FixedString',
            'nvarchar': 'String',
            'ntext': 'String',
            'binary': 'String',
            'varbinary': 'String',
            'image': 'String',
            'uniqueidentifier': 'String',
            'xml': 'String'
        }
    
    def connect_mssql(self) -> bool:
        try:
            self.mssql_conn = pymssql.connect(
                server=os.getenv('MSSQL_SERVER', 'localhost'),
                user=os.getenv('MSSQL_USER', 'sa'),
                password=os.getenv('MSSQL_PASSWORD', 'YourStrong@Passw0rd'),
                database=os.getenv('MSSQL_DATABASE', ''),
                port=int(os.getenv('MSSQL_PORT', 1433))
            )
            logger.info("Connected to MSSQL successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to MSSQL: {e}")
            return False
    
    def connect_clickhouse(self) -> bool:
        try:
            self.clickhouse_client = clickhouse_connect.get_client(
                host=os.getenv('CLICKHOUSE_HOST', 'localhost'),
                port=int(os.getenv('CLICKHOUSE_PORT', 8123)),
                username=os.getenv('CLICKHOUSE_USER', 'default'),
                password=os.getenv('CLICKHOUSE_PASSWORD', 'ClickHouse@2024')
            )
            result = self.clickhouse_client.query('SELECT version()')
            logger.info(f"Connected to ClickHouse version: {result.result_rows[0][0]}")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to ClickHouse: {e}")
            return False
    
    def get_mssql_tables(self) -> List[str]:
        try:
            cursor = self.mssql_conn.cursor()
            cursor.execute("""
                SELECT TABLE_NAME 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_TYPE = 'BASE TABLE'
                ORDER BY TABLE_NAME
            """)
            tables = [row[0] for row in cursor.fetchall()]
            logger.info(f"Found {len(tables)} tables in MSSQL")
            return tables
        except Exception as e:
            logger.error(f"Failed to get MSSQL tables: {e}")
            return []
    
    def get_table_schema(self, table_name: str) -> List[Tuple[str, str, bool, Any]]:
        try:
            cursor = self.mssql_conn.cursor()
            cursor.execute("""
                SELECT 
                    COLUMN_NAME,
                    DATA_TYPE,
                    IS_NULLABLE,
                    CHARACTER_MAXIMUM_LENGTH,
                    NUMERIC_PRECISION,
                    NUMERIC_SCALE
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = %s
                ORDER BY ORDINAL_POSITION
            """, (table_name,))
            
            schema = []
            for row in cursor.fetchall():
                column_name, data_type, is_nullable, max_length, precision, scale = row
                is_nullable_bool = is_nullable == 'YES'
                
                schema.append((column_name, data_type, is_nullable_bool, {
                    'max_length': max_length,
                    'precision': precision,
                    'scale': scale
                }))
            
            logger.info(f"Retrieved schema for table {table_name}: {len(schema)} columns")
            return schema
        except Exception as e:
            logger.error(f"Failed to get schema for table {table_name}: {e}")
            return []
    
    def map_mssql_to_clickhouse_type(self, mssql_type: str, metadata: Dict) -> str:
        mssql_type_lower = mssql_type.lower()
        
        if mssql_type_lower in ['char', 'nchar'] and metadata.get('max_length'):
            return f"FixedString({metadata['max_length']})"
        elif mssql_type_lower in ['varchar', 'nvarchar'] and metadata.get('max_length'):
            if metadata['max_length'] == -1:
                return 'String'
            return 'String'
        elif mssql_type_lower in ['decimal', 'numeric'] and metadata.get('precision') and metadata.get('scale'):
            precision = metadata['precision']
            scale = metadata['scale']
            if precision <= 9:
                return f"Decimal32({scale})"
            elif precision <= 18:
                return f"Decimal64({scale})"
            else:
                return f"Decimal128({scale})"
        
        return self.type_mapping.get(mssql_type_lower, 'String')
    
    def create_clickhouse_table(self, table_name: str, schema: List[Tuple[str, str, bool, Any]]) -> bool:
        try:
            columns = []
            for column_name, data_type, is_nullable, metadata in schema:
                ch_type = self.map_mssql_to_clickhouse_type(data_type, metadata)
                
                if is_nullable and not ch_type.startswith('Nullable'):
                    ch_type = f"Nullable({ch_type})"
                
                columns.append(f"`{column_name}` {ch_type}")
            
            create_table_sql = f"""
                CREATE TABLE IF NOT EXISTS `{table_name}` (
                    {', '.join(columns)}
                ) ENGINE = MergeTree()
                ORDER BY tuple()
            """
            
            logger.info(f"Creating ClickHouse table: {table_name}")
            logger.debug(f"SQL: {create_table_sql}")
            
            self.clickhouse_client.command(create_table_sql)
            logger.info(f"Successfully created table: {table_name}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to create ClickHouse table {table_name}: {e}")
            return False
    
    def migrate_all_tables(self) -> Dict[str, bool]:
        results = {}
        
        if not self.connect_mssql():
            logger.error("Cannot connect to MSSQL. Aborting migration.")
            return results
        
        if not self.connect_clickhouse():
            logger.error("Cannot connect to ClickHouse. Aborting migration.")
            return results
        
        try:
            tables = self.get_mssql_tables()
            
            for table_name in tables:
                logger.info(f"Processing table: {table_name}")
                
                schema = self.get_table_schema(table_name)
                if not schema:
                    logger.warning(f"Skipping table {table_name} - no schema found")
                    results[table_name] = False
                    continue
                
                success = self.create_clickhouse_table(table_name, schema)
                results[table_name] = success
                
                if success:
                    logger.info(f"✓ Successfully migrated table: {table_name}")
                else:
                    logger.error(f"✗ Failed to migrate table: {table_name}")
            
            return results
            
        except Exception as e:
            logger.error(f"Migration failed: {e}")
            return results
        finally:
            self.close_connections()
    
    def close_connections(self):
        if self.mssql_conn:
            self.mssql_conn.close()
            logger.info("MSSQL connection closed")
        
        if self.clickhouse_client:
            self.clickhouse_client.close()
            logger.info("ClickHouse connection closed")


def main():
    migrator = DatabaseMigrator()
    
    logger.info("Starting database migration from MSSQL to ClickHouse")
    results = migrator.migrate_all_tables()
    
    logger.info("Migration Summary:")
    success_count = sum(1 for success in results.values() if success)
    total_count = len(results)
    
    logger.info(f"Successfully migrated: {success_count}/{total_count} tables")
    
    for table_name, success in results.items():
        status = "✓" if success else "✗"
        logger.info(f"{status} {table_name}")
    
    if success_count == total_count and total_count > 0:
        logger.info("All tables migrated successfully!")
    elif success_count > 0:
        logger.warning(f"Partial migration: {success_count} out of {total_count} tables migrated")
    else:
        logger.error("Migration failed for all tables")


if __name__ == "__main__":
    main()