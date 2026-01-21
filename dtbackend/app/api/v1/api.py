from fastapi import APIRouter

from app.api.v1.endpoints import (
    announcements,
    config,
    dashboards,
    data,
    platforms,
    reports,
    users,
    feedback,
)
from app.api.v1.endpoints.romiot.station import station, work_order, qr_code
from app.api.v1.endpoints.romiot import stats

api_router = APIRouter()

api_router.include_router(dashboards.router, prefix="/dashboards", tags=["dashboards"])
api_router.include_router(data.router, prefix="/data", tags=["data"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(platforms.router, prefix="/platforms", tags=["platforms"])
api_router.include_router(announcements.router, prefix="/announcements", tags=["announcements"])
api_router.include_router(config.router, tags=["config"])
api_router.include_router(feedback.router, prefix="/feedback", tags=["feedback"])
api_router.include_router(work_order.router, prefix="/romiot/station/work-orders", tags=["work-orders"])
api_router.include_router(station.router, prefix="/romiot/station/stations", tags=["stations"])
api_router.include_router(qr_code.router, prefix="/romiot/station/qr-code", tags=["qr-code"])
api_router.include_router(stats.router, prefix="/romiot/stats", tags=["romiot-stats"])
