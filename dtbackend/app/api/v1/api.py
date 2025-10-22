from fastapi import APIRouter
from app.api.v1.endpoints import dashboards, data, users, reports, platforms

api_router = APIRouter()

api_router.include_router(dashboards.router, prefix="/dashboards", tags=["dashboards"])
api_router.include_router(data.router, prefix="/data", tags=["data"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(platforms.router, prefix="/platforms", tags=["platforms"])
