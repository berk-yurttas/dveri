import asyncio, json
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from app.core.config import settings

async def main():
    engine = create_async_engine(settings.postgres_database_url)
    async with engine.begin() as conn:
        res = await conn.execute(text("SELECT code, db_type, db_config, db_configs FROM platforms WHERE code='ivme'"))
        row = res.fetchone()
        if not row:
            print('ivme not found')
            return
        print('code:', row[0])
        print('db_type:', row[1])
        print('db_config:', json.dumps(row[2], ensure_ascii=False, indent=2))
        print('db_configs:', json.dumps(row[3], ensure_ascii=False, indent=2))
    await engine.dispose()

asyncio.run(main())
