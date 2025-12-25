#!/usr/bin/env python3
"""
Helper script to manage migrations for multiple databases
"""
import os
import sys

from alembic import command
from alembic.config import Config

# Add the current directory to Python path
sys.path.insert(0, os.getcwd())

ALEMBIC_CONFIGS = {
    "primary": "alembic.ini",
    "romiot": "alembic_romiot.ini"
}


def print_usage():
    print("""
Manage Migrations for Multiple Databases

Usage:
    python manage_migrations.py <database> <command> [args...]

Databases:
    primary   - Primary PostgreSQL database (default)
    romiot - RomIOT PostgreSQL database

Commands:
    create <message>    - Create a new migration with autogenerate
    upgrade [revision]  - Apply migrations (default: head)
    downgrade [revision]- Rollback migrations (default: -1)
    current             - Show current revision
    history             - Show migration history
    stamp <revision>    - Stamp database with a revision

Examples:
    python manage_migrations.py primary create "add users table"
    python manage_migrations.py romiot upgrade head
    python manage_migrations.py primary current
    python manage_migrations.py romiot history
    """)


def main():
    if len(sys.argv) < 3:
        print_usage()
        sys.exit(1)

    db_name = sys.argv[1].lower()
    cmd = sys.argv[2].lower()

    if db_name not in ALEMBIC_CONFIGS:
        print(f"❌ Unknown database: {db_name}")
        print(f"Available databases: {', '.join(ALEMBIC_CONFIGS.keys())}")
        sys.exit(1)

    config_path = ALEMBIC_CONFIGS[db_name]

    if not os.path.exists(config_path):
        print(f"❌ Config file not found: {config_path}")
        sys.exit(1)

    alembic_cfg = Config(config_path)

    try:
        if cmd == "create":
            if len(sys.argv) < 4:
                message = "Auto migration"
            else:
                message = " ".join(sys.argv[3:])

            print(f"📝 Creating migration for {db_name} database...")
            command.revision(alembic_cfg, autogenerate=True, message=message)
            print(f"✅ Migration created successfully for {db_name}!")

        elif cmd == "upgrade":
            revision = sys.argv[3] if len(sys.argv) > 3 else "head"
            print(f"🚀 Upgrading {db_name} database to {revision}...")
            command.upgrade(alembic_cfg, revision)
            print(f"✅ {db_name} database upgraded successfully!")

        elif cmd == "downgrade":
            revision = sys.argv[3] if len(sys.argv) > 3 else "-1"
            print(f"⏪ Downgrading {db_name} database to {revision}...")
            command.downgrade(alembic_cfg, revision)
            print(f"✅ {db_name} database downgraded successfully!")

        elif cmd == "current":
            print(f"📊 Current revision for {db_name} database:")
            command.current(alembic_cfg)

        elif cmd == "history":
            print(f"📜 Migration history for {db_name} database:")
            command.history(alembic_cfg)

        elif cmd == "stamp":
            if len(sys.argv) < 4:
                print("❌ Please specify a revision to stamp")
                sys.exit(1)
            revision = sys.argv[3]
            print(f"🏷️  Stamping {db_name} database with revision {revision}...")
            command.stamp(alembic_cfg, revision)
            print(f"✅ {db_name} database stamped successfully!")

        else:
            print(f"❌ Unknown command: {cmd}")
            print_usage()
            sys.exit(1)

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

