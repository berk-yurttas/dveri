from typing import Any

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.postgres_models import Config, Platform
from app.schemas.config import ConfigCreate, ConfigUpdate


class ConfigService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_config(self, config_key: str, platform: Platform | None = None) -> Config | None:
        """Get a configuration by key, optionally filtered by platform"""
        filters = [Config.config_key == config_key]

        if platform:
            # First try to get platform-specific config
            stmt = select(Config).where(
                and_(Config.config_key == config_key, Config.platform_id == platform.id)
            )
            result = await self.db.execute(stmt)
            config = result.scalar_one_or_none()

            if config:
                return config

            # Fall back to global config (platform_id is None)
            filters.append(Config.platform_id.is_(None))
        else:
            filters.append(Config.platform_id.is_(None))

        stmt = select(Config).where(and_(*filters))
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all_configs(self, platform: Platform | None = None) -> list[Config]:
        """Get all configurations, optionally filtered by platform"""
        if platform:
            stmt = select(Config).where(
                or_(Config.platform_id == platform.id, Config.platform_id.is_(None))
            )
        else:
            stmt = select(Config).where(Config.platform_id.is_(None))

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_config(self, config_data: ConfigCreate, platform: Platform | None = None) -> Config:
        """Create a new configuration"""
        db_config = Config(
            platform_id=platform.id if platform else None,
            config_key=config_data.config_key,
            config_value=config_data.config_value,
            description=config_data.description
        )
        self.db.add(db_config)
        await self.db.commit()
        await self.db.refresh(db_config)
        return db_config

    async def update_config(self, config_key: str, config_data: ConfigUpdate, platform: Platform | None = None) -> Config | None:
        """Update an existing configuration"""
        config = await self.get_config(config_key, platform)

        if not config:
            return None

        if config_data.config_value is not None:
            config.config_value = config_data.config_value
        if config_data.description is not None:
            config.description = config_data.description

        await self.db.commit()
        await self.db.refresh(config)
        return config

    async def upsert_config(self, config_key: str, config_value: dict[str, Any], description: str | None = None, platform: Platform | None = None) -> Config:
        """Update configuration if exists, create if not"""
        config = await self.get_config(config_key, platform)

        if config:
            config.config_value = config_value
            if description is not None:
                config.description = description
            await self.db.commit()
            await self.db.refresh(config)
            return config
        else:
            return await self.create_config(
                ConfigCreate(config_key=config_key, config_value=config_value, description=description),
                platform
            )

    async def delete_config(self, config_key: str, platform: Platform | None = None) -> bool:
        """Delete a configuration"""
        config = await self.get_config(config_key, platform)

        if not config:
            return False

        await self.db.delete(config)
        await self.db.commit()
        return True
