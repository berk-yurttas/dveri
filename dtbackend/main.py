import os
from contextlib import asynccontextmanager

# Set ODBC environment variables before any imports that might use them
# This is critical for Linux systems to find ODBC drivers
os.environ.setdefault('ODBCSYSINI', '/etc')
os.environ.setdefault('ODBCINI', '/etc/odbc.ini')

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.api import api_router
from app.core.config import settings
from app.core.middleware import AuthMiddleware
from app.core.platform_middleware import PlatformMiddleware
from app.services.csuite_history_scheduler import CSuiteHistoryScheduler


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Start background scheduler that writes one snapshot per company per ISO week.
    CSuiteHistoryScheduler.start()
    try:
        yield
    finally:
        await CSuiteHistoryScheduler.stop()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Dashboard Backend API",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

# Add platform middleware (before auth to set platform context)
app.add_middleware(PlatformMiddleware)

# Add authentication middleware
app.add_middleware(AuthMiddleware)

# Add CORS last so it wraps all responses (including middleware and error responses)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router (auth handled by middleware)
app.include_router(
    api_router,
    prefix=settings.API_V1_STR
)

@app.get("/")
async def root():
    return {"message": "Dashboard API is running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=["app"]
    )
