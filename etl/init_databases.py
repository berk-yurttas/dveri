#!/usr/bin/env python3
"""
Script to create REHIS_TestKayit_Test and REHIS_TestTanim_Test databases in MS SQL Server.
Run this script before starting the transfer process.
"""

import pymssql
import os
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def create_databases():
    """Create REHIS_TestKayit_Test and REHIS_TestTanim_Test databases"""
    
    server = os.getenv('MSSQL_HOST', 'localhost')
    user = os.getenv('MSSQL_USER', 'sa')
    password = os.getenv('MSSQL_PASSWORD')
    port = int(os.getenv('MSSQL_PORT', 1433))
    
    if not password:
        logger.error("MSSQL_PASSWORD environment variable is not set")
        return False
    
    databases_to_create = [
        'REHIS_TestKayit_Test',
        'REHIS_TestTanim_Test'
    ]
    
    try:
        # Connect to master database to create new databases
        logger.info(f"Connecting to MSSQL Server: {server}:{port}")
        connection = pymssql.connect(
            server=server,
            user=user,
            password=password,
            database='master',
            port=port,
            timeout=30,
            login_timeout=30,
            autocommit=True  # Required for CREATE DATABASE
        )
        
        cursor = connection.cursor()
        
        for db_name in databases_to_create:
            try:
                # Check if database exists
                logger.info(f"Checking if database '{db_name}' exists...")
                cursor.execute(
                    "SELECT name FROM sys.databases WHERE name = %s",
                    (db_name,)
                )
                exists = cursor.fetchone()
                
                if exists:
                    logger.info(f"✓ Database '{db_name}' already exists")
                else:
                    # Create database - use direct SQL since CREATE DATABASE cannot be parameterized
                    logger.info(f"Creating database '{db_name}'...")
                    cursor.execute(f"CREATE DATABASE [{db_name}]")
                    logger.info(f"✓ Database '{db_name}' created successfully")
                    
            except Exception as e:
                logger.error(f"✗ Error with database '{db_name}': {e}")
                return False
        
        cursor.close()
        connection.close()
        logger.info("\n✓ Database initialization completed successfully!")
        return True
        
    except Exception as e:
        logger.error(f"✗ Failed to connect to MSSQL Server: {e}")
        logger.error(f"Connection details - Server: {server}:{port}, User: {user}")
        return False


def create_tables():
    """Create all required tables in both databases"""
    
    server = os.getenv('MSSQL_HOST', 'localhost')
    user = os.getenv('MSSQL_USER', 'sa')
    password = os.getenv('MSSQL_PASSWORD')
    port = int(os.getenv('MSSQL_PORT', 1433))
    
    if not password:
        logger.error("MSSQL_PASSWORD environment variable is not set")
        return False
    
    # Read SQL script
    script_path = os.path.join(os.path.dirname(__file__), 'create_mssql_tables.sql')
    
    if not os.path.exists(script_path):
        logger.error(f"SQL script not found: {script_path}")
        return False
    
    try:
        logger.info(f"Reading SQL script: {script_path}")
        with open(script_path, 'r', encoding='utf-8') as f:
            sql_script = f.read()
        
        # Split script by GO statements and execute each batch
        sql_batches = [batch.strip() for batch in sql_script.split('GO') if batch.strip() and not batch.strip().startswith('--')]
        
        logger.info(f"Executing {len(sql_batches)} SQL batches...")
        
        # Connect to master to execute USE statements
        connection = pymssql.connect(
            server=server,
            user=user,
            password=password,
            database='master',
            port=port,
            timeout=30,
            login_timeout=30,
            autocommit=True
        )
        
        cursor = connection.cursor()
        
        for i, batch in enumerate(sql_batches, 1):
            if not batch or len(batch) < 5:
                continue
                
            try:
                # Execute each batch
                cursor.execute(batch)
                logger.info(f"  ✓ Batch {i}/{len(sql_batches)} executed")
            except Exception as e:
                logger.warning(f"  ⚠ Batch {i} warning: {e}")
                # Continue even if some batches fail (e.g., table already exists)
        
        cursor.close()
        connection.close()
        
        logger.info("✓ Table creation completed!")
        return True
        
    except Exception as e:
        logger.error(f"✗ Failed to create tables: {e}")
        return False


if __name__ == '__main__':
    logger.info("="*60)
    logger.info("MS SQL Server Database & Table Initialization")
    logger.info("="*60)
    
    # Step 1: Create databases
    success = create_databases()
    if not success:
        logger.error("Failed to create databases")
        exit(1)
    
    # Step 2: Create tables
    logger.info("\n" + "="*60)
    logger.info("Creating Tables")
    logger.info("="*60)
    success = create_tables()
    if not success:
        logger.error("Failed to create tables")
        exit(1)
    
    logger.info("\n" + "="*60)
    logger.info("✓ All initialization steps completed successfully!")
    logger.info("="*60)
    exit(0)

