#!/usr/bin/env python3
"""
Script to create Alembic migrations for PostgreSQL
Usage: python create_migration.py "migration message"
"""
import sys
import os
from alembic.config import Config
from alembic import command

def create_migration(message="Auto migration"):
    """Create a new migration with the given message"""
    # Set up Alembic config
    alembic_cfg = Config("alembic.ini")
    
    # Create the migration
    try:
        command.revision(alembic_cfg, autogenerate=True, message=message)
        print(f"✅ Migration created successfully: {message}")
    except Exception as e:
        print(f"❌ Error creating migration: {e}")
        return False
    
    return True

def run_migrations():
    """Run all pending migrations"""
    alembic_cfg = Config("alembic.ini")
    
    try:
        command.upgrade(alembic_cfg, "head")
        print("✅ Migrations applied successfully")
    except Exception as e:
        print(f"❌ Error running migrations: {e}")
        return False
    
    return True

def show_migration_status():
    """Show current migration status"""
    alembic_cfg = Config("alembic.ini")
    
    try:
        command.current(alembic_cfg)
        print("Current migration status shown above")
    except Exception as e:
        print(f"❌ Error checking migration status: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        if sys.argv[1] == "upgrade":
            run_migrations()
        elif sys.argv[1] == "current":
            show_migration_status()
        else:
            # Treat as migration message
            message = " ".join(sys.argv[1:])
            create_migration(message)
    else:
        create_migration("Create initial tables")
