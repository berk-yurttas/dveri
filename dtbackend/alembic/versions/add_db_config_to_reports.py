"""add db_config to reports

Revision ID: add_db_config_002
Revises: add_db_configs_001
Create Date: 2026-01-28 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision = 'add_db_config_002'
down_revision = 'add_db_configs_001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add db_config column to reports table
    op.add_column('reports', sa.Column('db_config', JSONB, nullable=True))
    
    # Migrate existing reports to use the platform's first db_config (or legacy db_config)
    # This SQL will set report db_config from the platform's db_configs array (first item) or legacy db_config
    op.execute("""
        UPDATE reports r
        SET db_config = (
            SELECT CASE
                -- If platform has db_configs array with items, use the first one
                WHEN p.db_configs IS NOT NULL AND jsonb_array_length(p.db_configs) > 0 THEN
                    p.db_configs->0
                -- Otherwise, build from legacy db_type and db_config
                WHEN p.db_config IS NOT NULL THEN
                    jsonb_build_object(
                        'name', 'Default Database',
                        'db_type', p.db_type,
                        'host', p.db_config->>'host',
                        'port', (p.db_config->>'port')::int,
                        'database', p.db_config->>'database',
                        'user', p.db_config->>'user',
                        'password', p.db_config->>'password',
                        'driver', p.db_config->>'driver',
                        'connection_string', p.db_config->>'connection_string'
                    )
                ELSE NULL
            END
            FROM platforms p
            WHERE p.id = r.platform_id
        )
        WHERE r.platform_id IS NOT NULL
    """)


def downgrade() -> None:
    # Remove db_config column from reports table
    op.drop_column('reports', 'db_config')

