#!/usr/bin/env python3
"""
Simple script to create and run PostgreSQL migrations
"""
import os
import sys

# Add the current directory to Python path
sys.path.insert(0, os.getcwd())

try:
    from alembic.config import Config
    from alembic import command
    
    print("🔧 Setting up Alembic configuration...")
    
    # Create Alembic config
    alembic_cfg = Config("alembic.ini")
    
    print("📝 Creating migration...")
    
    # Create the migration
    command.revision(alembic_cfg, autogenerate=True, message="Create initial tables")
    
    print("✅ Migration created successfully!")
    print("📁 Check the 'alembic/versions' directory for the new migration file.")
    
    # Ask if user wants to apply the migration
    print("\n" + "="*50)
    print("To apply the migration, run:")
    print("python run_migration.py upgrade")
    
except ImportError as e:
    print(f"❌ Import error: {e}")
    print("Make sure you're in the virtual environment and alembic is installed.")
except Exception as e:
    print(f"❌ Error: {e}")
    print("Make sure PostgreSQL is running and your .env file is configured correctly.")

# If 'upgrade' argument is passed, run migrations
if len(sys.argv) > 1 and sys.argv[1] == "upgrade":
    try:
        print("🚀 Applying migrations...")
        command.upgrade(alembic_cfg, "head")
        print("✅ All migrations applied successfully!")
    except Exception as e:
        print(f"❌ Error applying migrations: {e}")
