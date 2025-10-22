from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.middleware import AuthMiddleware
from app.core.platform_middleware import PlatformMiddleware
from app.api.v1.api import api_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Dashboard Backend API",
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Set up CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add platform middleware (before auth to set platform context)
app.add_middleware(PlatformMiddleware)

# Add authentication middleware
app.add_middleware(AuthMiddleware)

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
