# Dashboard Backend API

A FastAPI application with MVC pattern for dashboard management, using PostgreSQL for metadata and ClickHouse for analytics data.

## Features

- **MVC Architecture**: Clean separation of concerns with Models, Views (Services), and Controllers
- **Dual Database Support**: PostgreSQL for metadata, ClickHouse for analytics data
- **ORM Integration**: SQLAlchemy with async support for PostgreSQL, ClickHouse SQL support
- **API Documentation**: Auto-generated OpenAPI/Swagger documentation
- **Database Migrations**: Alembic integration for PostgreSQL schema management
- **Docker Support**: Ready-to-use Docker configuration

## Project Structure

```
dtbackend/
├── app/
│   ├── api/                    # API layer (Controllers)
│   │   └── v1/
│   │       ├── api.py         # API router configuration
│   │       └── endpoints/     # API endpoint definitions
│   ├── core/                  # Core configuration
│   │   ├── config.py         # Application settings
│   │   └── database.py       # Database connections
│   ├── models/               # Data models (ORM)
│   │   ├── postgres_models.py # PostgreSQL models
│   │   └── clickhouse_models.py # ClickHouse models
│   ├── schemas/              # Pydantic schemas
│   │   ├── dashboard.py      # Dashboard schemas
│   │   └── data.py          # Data schemas
│   └── services/            # Business logic (Views)
│       ├── dashboard_service.py # Dashboard operations
│       └── data_service.py     # Data operations
├── alembic/                 # Database migrations
├── main.py                  # Application entry point
├── requirements.txt         # Python dependencies
└── Dockerfile              # Docker configuration
```

## Quick Start

### 1. Environment Setup

Copy the environment template:
```bash
cp env.example .env
```

Update the `.env` file with your database credentials.

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Database Setup

#### PostgreSQL (Metadata)
Run migrations to create the schema:
```bash
alembic upgrade head
```

#### ClickHouse (Analytics Data)
Create the database and tables manually or use the provided models as reference.

### 4. Run the Application

```bash
uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`

### 5. API Documentation

Visit `http://localhost:8000/docs` for interactive API documentation.

## Docker Usage

### Build and Run

```bash
docker build -t dashboard-backend .
docker run -p 8000:8000 dashboard-backend
```

### Using Docker Compose

Add the backend service to your `docker-compose.yml`:

```yaml
services:
  backend:
    build: ./dtbackend
    ports:
      - "8000:8000"
    environment:
      - POSTGRES_SERVER=postgres
      - CLICKHOUSE_HOST=clickhouse
    depends_on:
      - postgres
      - clickhouse
```

## API Endpoints

### Dashboards
- `POST /api/v1/dashboards/` - Create dashboard
- `GET /api/v1/dashboards/` - List user dashboards
- `GET /api/v1/dashboards/public` - List public dashboards
- `GET /api/v1/dashboards/{id}` - Get dashboard details
- `PUT /api/v1/dashboards/{id}` - Update dashboard
- `DELETE /api/v1/dashboards/{id}` - Delete dashboard

### Data
- `POST /api/v1/data/metrics` - Get metrics data
- `POST /api/v1/data/performance` - Get performance data
- `POST /api/v1/data/business` - Get business data
- `POST /api/v1/data/aggregated` - Get aggregated metrics
- `POST /api/v1/data/query` - Execute custom query
- `GET /api/v1/data/health` - Health check

## Database Models

### PostgreSQL (Metadata)
- **Users**: User management
- **Dashboards**: Dashboard metadata
- **Widgets**: Widget configurations
- **Reports**: Report definitions

### ClickHouse (Analytics)
- **MetricsData**: Time-series metrics
- **PerformanceData**: System performance data
- **BusinessData**: Business analytics
- **LogData**: Application logs

## Development

### Adding New Endpoints

1. Create schema in `app/schemas/`
2. Add business logic in `app/services/`
3. Create endpoint in `app/api/v1/endpoints/`
4. Register router in `app/api/v1/api.py`

### Database Migrations

Generate new migration:
```bash
alembic revision --autogenerate -m "Description"
```

Apply migrations:
```bash
alembic upgrade head
```

## Configuration

Key environment variables:

- `POSTGRES_*`: PostgreSQL connection settings
- `CLICKHOUSE_*`: ClickHouse connection settings
- `SECRET_KEY`: JWT signing key
- `BACKEND_CORS_ORIGINS`: Allowed CORS origins

## Security Notes

- Change `SECRET_KEY` in production
- Use environment variables for sensitive data
- Custom queries are filtered for dangerous keywords
- Add authentication middleware as needed
