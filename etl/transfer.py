import pymssql
import clickhouse_connect
import os
from typing import Dict, List, Tuple, Any, Optional
import logging
from datetime import datetime, date
import sys
from decimal import Decimal
import uuid
from migrate import DatabaseMigrator
import traceback
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class DataTransfer:
    def __init__(self, batch_size: int = 10000):
        self.mssql_connections = {}
        self.clickhouse_client = None
        self.batch_size = batch_size
        self.migrate = DatabaseMigrator()
        # Common connection properties for all databases
        server = os.getenv('MSSQL_HOST', 'localhost')
        user = os.getenv('MSSQL_USER', 'sa')
        password = os.getenv('MSSQL_PASSWORD', 'YourStrong@Passw0rd')
        print(f"MSSQL_HOST: {server}, MSSQL_USER: {user}, MSSQL_PASSWORD: {password}")
        port = int(os.getenv('MSSQL_PORT', 1433))
        
        self.database_configs = {
            'REHIS_TestKayit_Test': {
                'server': server,
                'user': user,
                'password': password,
                'database': 'master',
                'port': port
            },
            'REHIS_TestTanim_Test': {
                'server': server,
                'user': user,
                'password': password,
                'database': 'msdb',
                'port': port
            }
        }
        
    def connect_mssql(self, database_name: str = None) -> bool:
        if database_name is None:
            # Connect to all configured databases
            all_connected = True
            for db_name in self.database_configs:
                if not self._connect_single_mssql(db_name):
                    all_connected = False
            return all_connected
        else:
            return self._connect_single_mssql(database_name)
    
    def _connect_single_mssql(self, database_name: str) -> bool:
        try:
            if database_name not in self.database_configs:
                logger.error(f"Database configuration not found: {database_name}")
                return False
            
            config = self.database_configs[database_name]
            server = config['server']
            user = config['user']
            password = config['password']
            database = config['database']
            port = config['port']
            
            logger.info(f"Attempting to connect to MSSQL: {server}:{port}, user: {user}, database: {database}")
            
            connection = pymssql.connect(
                server=server,
                user=user,
                password=password,
                database=database,
                port=port,
                timeout=30,
                login_timeout=30
            )
            self.mssql_connections[database_name] = connection
            logger.info(f"Connected to MSSQL database {database_name} successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to MSSQL database {database_name}: {e}")
            logger.error(f"Connection details - Server: {server}:{port}, User: {user}, Database: {database}")
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
    
    def get_table_columns(self, table_name: str, database_name: str) -> List[Tuple[str, str]]:
        try:
            if database_name not in self.mssql_connections:
                logger.error(f"No connection found for database: {database_name}")
                return []
            cursor = self.mssql_connections[database_name].cursor()
            cursor.execute("""
                SELECT COLUMN_NAME, DATA_TYPE 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = %s
                ORDER BY ORDINAL_POSITION
            """, (table_name,))
            
            columns = [(row[0], row[1]) for row in cursor.fetchall()]
            logger.info(f"Retrieved {len(columns)} columns for table {table_name}")
            return columns
        except Exception as e:
            logger.error(f"Failed to get columns for table {table_name}: {e}")
            return []
    
    def get_table_count(self, table_name: str, database_name: str, where_clause: str = "") -> int:
        try:
            if database_name not in self.mssql_connections:
                logger.error(f"No connection found for database: {database_name}")
                return 0
            cursor = self.mssql_connections[database_name].cursor()
            query = f"SELECT COUNT(*) FROM [{table_name}]"
            if where_clause:
                query += f" WHERE {where_clause}"
            cursor.execute(query)
            count = cursor.fetchone()[0]
            logger.info(f"Table {table_name} has {count:,} rows {f'with filter: {where_clause}' if where_clause else ''}")
            return count
        except Exception as e:
            logger.error(f"Failed to get count for table {table_name}: {e}")
            return 0
    
    def check_clickhouse_table_exists(self, table_name: str) -> bool:
        try:
            result = self.clickhouse_client.query(f"EXISTS TABLE `{table_name}`")
            exists = result.result_rows[0][0] == 1
            logger.info(f"ClickHouse table {table_name} exists: {exists}")
            return exists
        except Exception as e:
            logger.error(f"Failed to check if ClickHouse table {table_name} exists: {e}")
            return False
    
    def transform_value(self, value: Any, data_type: str) -> Any:
        if value is None:
            return None
        
        data_type_lower = data_type.lower()
        
        try:
            if data_type_lower in ['datetime' , 'datetimeoffset', 'datetime2', 'smalldatetime']:
                if isinstance(value, datetime):
                    min_datetime = datetime(2000,1,1)
                    if value < min_datetime:
                        return min_datetime
                    return value
                # Handle string datetime values
                elif isinstance(value, str):
                    try:
                        return datetime.fromisoformat(value.replace('Z', '+00:00')).replace(tzinfo=None)
                    except:
                        return value
                return value
            elif data_type_lower == 'date':
                if isinstance(value, date):
                    return value
                return value
            elif data_type_lower in ['decimal', 'numeric', 'money', 'smallmoney']:
                if isinstance(value, Decimal):
                    return float(value)
                return float(value) if value is not None else None
            elif data_type_lower in ['bit']:
                return int(value) if value is not None else None
            elif data_type_lower == 'uniqueidentifier':
                if isinstance(value, uuid.UUID):
                    return str(value)
                return str(value) if value is not None else None
            elif data_type_lower in ['binary', 'varbinary', 'image']:
                if isinstance(value, bytes):
                    return value.hex()
                return str(value) if value is not None else None
            else:
                return value
        except Exception as e:
            logger.warning(f"Failed to transform value {value} of type {data_type}: {e}")
            return str(value) if value is not None else None
    




    def get_primary_key_columns(self, table_name: str, database_name: str) -> List[str]:
        try:
            if database_name not in self.mssql_connections:
                logger.error(f"No connection found for database: {database_name}")
                return []
            cursor = self.mssql_connections[database_name].cursor()
            cursor.execute("""
                SELECT c.COLUMN_NAME
                FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE ccu ON tc.CONSTRAINT_NAME = ccu.CONSTRAINT_NAME
                JOIN INFORMATION_SCHEMA.COLUMNS c ON ccu.COLUMN_NAME = c.COLUMN_NAME AND ccu.TABLE_NAME = c.TABLE_NAME
                WHERE tc.TABLE_NAME = %s 
                AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
                ORDER BY c.ORDINAL_POSITION
            """, (table_name,))
            
            pk_cols = [row[0] for row in cursor.fetchall()]
            logger.debug(f"Primary key columns for {table_name}: {pk_cols}")
            return pk_cols
        except Exception as e:
            logger.error(f"Failed to get primary key columns for {table_name}: {e}")
            return []

    def get_max_primary_key(self, table_name: str, database_name: str, pk_columns: List[str]) -> Optional[Any]:
        try:
            if database_name not in self.mssql_connections:
                logger.error(f"No connection found for database: {database_name}")
                return None
            cursor = self.mssql_connections[database_name].cursor()
            # For single column primary key, get the maximum value
            if len(pk_columns) == 1:
                pk_col = pk_columns[0]
                cursor.execute(f"SELECT MAX([{pk_col}]) FROM [{table_name}]")
                result = cursor.fetchone()
                max_pk = result[0] if result and result[0] is not None else None
                logger.info(f"Maximum primary key value for {table_name}.{pk_col}: {max_pk}")
                return max_pk
            else:
                logger.warning(f"Composite primary key not supported for incremental sync in {table_name}")
                return None
        except Exception as e:
            logger.error(f"Failed to get max primary key for {table_name}: {e}")
            return None

    def extract_data_batch(self, table_name: str, database_name: str, columns: List[Tuple[str, str]], 
                          offset: int, limit: int, where_clause: str = "") -> List[List[Any]]:
        try:
            if database_name not in self.mssql_connections:
                logger.error(f"No connection found for database: {database_name}")
                return []
            cursor = self.mssql_connections[database_name].cursor()
            column_names = [col[0] for col in columns]
            column_list = ', '.join([f'[{col}]' for col in column_names])
            
            query = f"""
                SELECT {column_list}
                FROM [{table_name}]
            """
            
            if where_clause:
                query += f" WHERE {where_clause}"
            
            query += f"""
                ORDER BY (SELECT NULL)
                OFFSET {offset} ROWS
                FETCH NEXT {limit} ROWS ONLY
            """
            
            cursor.execute(query)
            rows = cursor.fetchall()
            
            transformed_rows = []
            for row in rows:
                transformed_row = []
                for i, (col_name, data_type) in enumerate(columns):
                    transformed_value = self.transform_value(row[i], data_type)
                    transformed_row.append(transformed_value)
                transformed_rows.append(transformed_row)
            
            logger.debug(f"Extracted {len(transformed_rows)} rows from {table_name} (offset: {offset})")
            return transformed_rows
            
        except Exception as e:
            logger.error(f"Failed to extract data from {table_name} at offset {offset}: {e}")
            return []
    
    def insert_batch_to_clickhouse(self, table_name: str, columns: List[str], 
                                  data: List[List[Any]]) -> bool:
        try:
            if not data:
                return True
            
            self.clickhouse_client.insert(table_name, data, column_names=columns)
            logger.debug(f"Inserted {len(data)} rows into ClickHouse table {table_name}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to insert batch into ClickHouse table {table_name}: {e}")
            stacktrace = traceback.format_exc()
            logger.error(f"Stacktrace: {stacktrace}")
            logger.error(f"Sample data: {data[:2] if data else 'No data'}")
            return False
    
    def transfer_table(self, table_name: str, database_name: str) -> Dict[str, Any]:
        result = {
            'table_name': table_name,
            'database_name': database_name,
            'success': False,
            'total_rows': 0,
            'transferred_rows': 0,
            'error': None,
            'start_time': datetime.now(),
            'end_time': None
        }
        
        try:
            clickhouse_table_name = f"{database_name}_{table_name}"
            if not self.check_clickhouse_table_exists(clickhouse_table_name):
                logger.info(f"ClickHouse table {clickhouse_table_name} does not exist. Creating...")
                # Set the connections for the migrator to use our existing connections
                self.migrate.mssql_conn = self.mssql_connections[database_name]
                self.migrate.clickhouse_client = self.clickhouse_client
                
                schema = self.migrate.get_table_schema(table_name)
                if schema:
                    success = self.migrate.create_clickhouse_table(clickhouse_table_name, schema)
                    if success:
                        logger.info(f"Created ClickHouse table {clickhouse_table_name}")
                    else:
                        result['error'] = f"Failed to create ClickHouse table {clickhouse_table_name}"
                        logger.error(result['error'])
                        return result
                else:
                    result['error'] = f"Failed to get schema for table {table_name} from {database_name}"
                    logger.error(result['error'])
                    return result
            
            columns = self.get_table_columns(table_name, database_name)
            if not columns:
                result['error'] = f"Could not retrieve columns for table {table_name} from {database_name}"
                logger.error(result['error'])
                return result
            
            # Build WHERE clause for incremental sync using primary key
            where_clause = ""
            is_full_sync = False
            pk_columns = self.get_primary_key_columns(table_name, database_name)
            
            if not pk_columns:
                # No primary key found - fall back to full sync
                logger.warning(f"No primary key found for table {table_name} in {database_name}. Falling back to full sync.")
                is_full_sync = True
                
                # For full sync, clear the ClickHouse table first if it exists
                if self.check_clickhouse_table_exists(clickhouse_table_name):
                    try:
                        self.clickhouse_client.command(f"TRUNCATE TABLE `{clickhouse_table_name}`")
                        logger.info(f"Cleared existing data from ClickHouse table {clickhouse_table_name} for full sync")
                    except Exception as e:
                        logger.warning(f"Failed to clear ClickHouse table {clickhouse_table_name}: {e}")
                        logger.info(f"Proceeding with full sync anyway")
            else:
                # Get the maximum primary key value from ClickHouse for incremental sync
                try:
                    query_result = self.clickhouse_client.query(f"SELECT MAX({pk_columns[0]}) FROM `{clickhouse_table_name}`")
                    if query_result.result_rows and query_result.result_rows[0][0] is not None:
                        max_pk_in_clickhouse = query_result.result_rows[0][0]
                        pk_col = pk_columns[0]
                        
                        # Format the value properly for SQL
                        if isinstance(max_pk_in_clickhouse, (str, datetime, date)):
                            formatted_value = f"'{max_pk_in_clickhouse}'"
                        else:
                            formatted_value = str(max_pk_in_clickhouse)
                        
                        where_clause = f"[{pk_col}] > {formatted_value}"
                        logger.info(f"Incremental sync for {database_name}.{table_name} using {pk_col} > {max_pk_in_clickhouse}")
                    else:
                        logger.info(f"No existing data in ClickHouse for {clickhouse_table_name}, starting incremental sync from beginning")
                except Exception as e:
                    logger.warning(f"Failed to get max primary key from ClickHouse for {clickhouse_table_name}: {e}")
                    logger.info(f"Starting incremental sync from beginning for {clickhouse_table_name}")
            
            total_rows = self.get_table_count(table_name, database_name, where_clause)
            result['total_rows'] = total_rows
            
            if total_rows == 0:
                sync_type = "full sync" if is_full_sync else "incremental sync"
                logger.info(f"Table {database_name}.{table_name} has no {'rows' if is_full_sync else 'new rows'} for {sync_type}, skipping transfer")
                result['success'] = True
                result['end_time'] = datetime.now()
                return result
            
            column_names = [col[0] for col in columns]
            transferred_rows = 0
            offset = 0
            
            sync_type = "full" if is_full_sync else "incremental"
            logger.info(f"Starting {sync_type} transfer of {total_rows:,} rows from {database_name}.{table_name}")
            
            while offset < total_rows:
                batch_data = self.extract_data_batch(table_name, database_name, columns, offset, self.batch_size, where_clause)
                
                if not batch_data:
                    break
                
                if not self.insert_batch_to_clickhouse(clickhouse_table_name, column_names, batch_data):
                    result['error'] = f"Failed to insert batch at offset {offset}"
                    logger.error(result['error'])
                    return result
                
                transferred_rows += len(batch_data)
                offset += self.batch_size
                
                progress = (transferred_rows / total_rows) * 100
                logger.info(f"Progress {database_name}.{table_name}: {transferred_rows:,}/{total_rows:,} ({progress:.1f}%)")
            
            
            result['transferred_rows'] = transferred_rows
            result['success'] = True
            sync_type = "full" if is_full_sync else "incremental"
            logger.info(f"✓ Successfully transferred {transferred_rows:,} rows from {database_name}.{table_name} to {clickhouse_table_name} ({sync_type})")
            
        except Exception as e:
            result['error'] = str(e)
            result['end_time'] = datetime.now()
            logger.error(f"Transfer failed for table {database_name}.{table_name}: {e}")
        
        if result['end_time'] is None:
            result['end_time'] = datetime.now()
        return result
    
    def get_mssql_tables(self, database_name: str) -> List[str]:
        try:
            if database_name not in self.mssql_connections:
                logger.error(f"No connection found for database: {database_name}")
                return []
            
            cursor = self.mssql_connections[database_name].cursor()
            cursor.execute("""
                SELECT TABLE_NAME 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_TYPE = 'BASE TABLE'
                ORDER BY TABLE_NAME
            """)
            all_tables = [row[0] for row in cursor.fetchall()]
            
            logger.info(f"Found {len(all_tables)} tables in MSSQL database {database_name}")
            logger.info("Note: Tables without primary keys will be handled with full sync")
            
            return all_tables
        except Exception as e:
            logger.error(f"Failed to get MSSQL tables from {database_name}: {e}")
            return []
    
    def transfer_all_tables(self, specific_tables: Optional[Dict[str, List[str]]] = None) -> Dict[str, Any]:
        summary = {
            'total_tables': 0,
            'successful_tables': 0,
            'failed_tables': 0,
            'total_rows_transferred': 0,
            'start_time': datetime.now(),
            'end_time': None,
            'results': []
        }
        
        if not self.connect_mssql():
            logger.error("Cannot connect to MSSQL databases. Aborting transfer.")
            return summary
        
        if not self.connect_clickhouse():
            logger.error("Cannot connect to ClickHouse. Aborting transfer.")
            return summary
        
        try:
            if specific_tables:
                # specific_tables is a dict: {database_name: [table_names]}
                all_table_tasks = []
                for db_name, table_list in specific_tables.items():
                    for table_name in table_list:
                        all_table_tasks.append((db_name, table_name))
            else:
                # Get all tables from all databases
                all_table_tasks = []
                for db_name in self.database_configs:
                    tables = self.get_mssql_tables(db_name)
                    for table_name in tables:
                        all_table_tasks.append((db_name, table_name))
            
            summary['total_tables'] = len(all_table_tasks)
            
            logger.info(f"Starting incremental data transfer for {len(all_table_tasks)} tables across {len(self.database_configs)} databases")
            
            for database_name, table_name in all_table_tasks:
                logger.info(f"Processing table: {database_name}.{table_name}")
                
                result = self.transfer_table(table_name, database_name)
                summary['results'].append(result)
                
                if result['success']:
                    summary['successful_tables'] += 1
                    summary['total_rows_transferred'] += result['transferred_rows']
                else:
                    summary['failed_tables'] += 1
                
                if result['end_time']:
                    duration = result['end_time'] - result['start_time']
                    logger.info(f"Table {database_name}.{table_name} completed in {duration}")
                else:
                    logger.info(f"Table {database_name}.{table_name} completed with error")
            
        except Exception as e:
            logger.error(f"Transfer process failed: {e}")
        finally:
            summary['end_time'] = datetime.now()
            self.close_connections()
        
        return summary
    
    def close_connections(self):
        for db_name, conn in self.mssql_connections.items():
            if conn:
                conn.close()
                logger.info(f"MSSQL connection for {db_name} closed")
        
        if self.clickhouse_client:
            self.clickhouse_client.close()
            logger.info("ClickHouse connection closed")


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Transfer data from multiple MSSQL databases to ClickHouse (incremental sync only)')
    parser.add_argument('--tables', nargs='*', help='Specific tables to transfer in format db_name:table_name (default: all tables from all databases)')
    parser.add_argument('--batch-size', type=int, default=10000, help='Batch size for data transfer (default: 10000)')
    
    args = parser.parse_args()
    
    transferer = DataTransfer(batch_size=args.batch_size)
    
    logger.info("Starting incremental data transfer from multiple MSSQL databases to ClickHouse")
    logger.info(f"Databases: REHIS_TestKayit_Test, REHIS_TestTanim_Test")
    logger.info(f"Batch size: {args.batch_size:,}")
    
    specific_tables = None
    if args.tables:
        # Parse table arguments in format db_name:table_name
        specific_tables = {}
        for table_spec in args.tables:
            if ':' in table_spec:
                db_name, table_name = table_spec.split(':', 1)
                if db_name not in specific_tables:
                    specific_tables[db_name] = []
                specific_tables[db_name].append(table_name)
            else:
                logger.warning(f"Invalid table specification: {table_spec}. Use format db_name:table_name")
        
        if specific_tables:
            logger.info(f"Transferring specific tables: {args.tables}")
            summary = transferer.transfer_all_tables(specific_tables=specific_tables)
        else:
            logger.info("No valid table specifications found. Transferring all tables.")
            summary = transferer.transfer_all_tables()
    else:
        logger.info("Transferring all tables from all databases")
        summary = transferer.transfer_all_tables()
    
    total_duration = summary['end_time'] - summary['start_time']
    
    logger.info("=" * 60)
    logger.info("TRANSFER SUMMARY")
    logger.info("=" * 60)
    logger.info(f"Total tables processed: {summary['total_tables']}")
    logger.info(f"Successful transfers: {summary['successful_tables']}")
    logger.info(f"Failed transfers: {summary['failed_tables']}")
    logger.info(f"Total rows transferred: {summary['total_rows_transferred']:,}")
    logger.info(f"Total duration: {total_duration}")
    
    if summary['failed_tables'] > 0:
        logger.info("\nFailed tables:")
        for result in summary['results']:
            if not result['success']:
                logger.info(f"✗ {result['database_name']}.{result['table_name']}: {result['error']}")
    
    logger.info("\nSuccessful tables:")
    for result in summary['results']:
        if result['success']:
            if result['end_time']:
                duration = result['end_time'] - result['start_time']
                logger.info(f"✓ {result['database_name']}.{result['table_name']}: {result['transferred_rows']:,} rows in {duration}")
            else:
                logger.info(f"✓ {result['database_name']}.{result['table_name']}: {result['transferred_rows']:,} rows")
    
    if summary['successful_tables'] == summary['total_tables'] and summary['total_tables'] > 0:
        logger.info("\n🎉 All tables transferred successfully!")
        sys.exit(0)
    elif summary['successful_tables'] > 0:
        logger.warning(f"\n⚠️  Partial success: {summary['successful_tables']}/{summary['total_tables']} tables transferred")
        sys.exit(1)
    else:
        logger.error("\n❌ All incremental transfers failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()