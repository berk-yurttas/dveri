# Managing Multiple Databases with Alembic

This project supports managing multiple databases using separate Alembic environments.

## Current Setup

- **Primary Database** (PostgreSQL): Managed by `alembic` directory and `alembic.ini`
- **Secondary Database** (PostgreSQL): Managed by `alembic_romiot` directory and `alembic_romiot.ini`

## Approach: Multiple Alembic Environments

Each database has its own:
- Alembic directory (`alembic/` and `alembic_romiot/`)
- Alembic configuration file (`alembic.ini` and `alembic_romiot.ini`)
- Separate migration versions in `versions/` subdirectories

## Usage

### Primary Database (existing)

```bash
# Create a migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head

# Rollback
alembic downgrade -1

# Check current revision
alembic current

# Show migration history
alembic history
```

### Secondary Database (new)

```bash
# Create a migration
alembic -c alembic_romiot.ini revision --autogenerate -m "description"

# Apply migrations
alembic -c alembic_romiot.ini upgrade head

# Rollback
alembic -c alembic_romiot.ini downgrade -1

# Check current revision
alembic -c alembic_romiot.ini current

# Show migration history
alembic -c alembic_romiot.ini history
```

## Configuration Steps

1. **Add secondary database URL to settings** (`app/core/config.py`):
   ```python
   # Add to Settings class
   SECONDARY_POSTGRES_DB: str = Field(default_factory=lambda: os.getenv("SECONDARY_POSTGRES_DB", "secondary_db"))
   
   @property
   def secondary_postgres_database_url(self) -> str:
       return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.SECONDARY_POSTGRES_DB}"
   ```

2. **Create secondary database models** (if needed):
   ```python
   # app/models/secondary_models.py
   from sqlalchemy.orm import declarative_base
   from sqlalchemy import Column, Integer, String
   
   SecondaryBase = declarative_base()
   
   class SecondaryModel(SecondaryBase):
       __tablename__ = "secondary_table"
       id = Column(Integer, primary_key=True)
       name = Column(String(255))
   ```

3. **Update `alembic_romiot/env.py`**:
   - Import your secondary models
   - Set `target_metadata = SecondaryBase.metadata`
   - Update `get_url()` to return `settings.secondary_postgres_database_url`

## Alternative Approaches

### 1. Using SQLAlchemy Bind Keys (Single Alembic)

If both databases use the same engine registry, you can use bind keys:

```python
# In your models
class Model1(Base):
    __tablename__ = 'model1'
    __bind_key__ = 'primary'
    
class Model2(Base):
    __tablename__ = 'model2'
    __bind_key__ = 'secondary'
```

Then configure Alembic to handle multiple binds in `env.py`.

### 2. Dynamic Database Selection

Modify `env.py` to accept a database identifier via environment variable or command-line argument.

## Benefits of Multiple Environments Approach

✅ Clear separation of concerns
✅ Independent migration versions
✅ Easier to manage and maintain
✅ No conflicts between database migrations
✅ Each database can have different migration strategies

## Troubleshooting

- **Import errors**: Make sure both `alembic/` and `alembic_romiot/` have access to your models
- **Connection errors**: Verify database URLs in your settings
- **Metadata issues**: Ensure each `env.py` imports the correct Base and metadata for that database

