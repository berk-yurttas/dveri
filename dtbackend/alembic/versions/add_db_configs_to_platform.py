"""add db_configs to platform

Revision ID: add_db_configs_001
Revises: add_direct_link_001
Create Date: 2026-01-28 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision = 'add_db_configs_001'
down_revision = 'add_login_tracking_001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add db_configs column to platforms table
    op.add_column('platforms', sa.Column('db_configs', JSONB, nullable=True, server_default='[]'))
    
    # Migrate existing db_config data to db_configs array format
    # This SQL will convert the single db_config to an array with one item
    op.execute("""
        UPDATE platforms 
        SET db_configs = jsonb_build_array(
            jsonb_build_object(
                'name', 'Primary Database',
                'db_type', db_type,
                'host', COALESCE(db_config->>'host', 'localhost'),
                'port', COALESCE((db_config->>'port')::int, 
                    CASE 
                        WHEN db_type = 'clickhouse' THEN 9000
                        WHEN db_type = 'mssql' THEN 1433
                        WHEN db_type = 'postgresql' THEN 5432
                        ELSE 8123
                    END),
                'database', COALESCE(db_config->>'database', ''),
                'user', COALESCE(db_config->>'user', ''),
                'password', COALESCE(db_config->>'password', ''),
                'driver', db_config->>'driver',
                'connection_string', db_config->>'connection_string',
                'settings', COALESCE(db_config->'settings', '{}'::jsonb),
                'is_default', true
            )
        )
        WHERE db_config IS NOT NULL AND db_config != 'null'::jsonb
    """)


def downgrade() -> None:
    # Remove db_configs column
    op.drop_column('platforms', 'db_configs')

