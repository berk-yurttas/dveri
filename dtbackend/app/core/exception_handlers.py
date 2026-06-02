"""Global exception handling that keeps CORS working on 500s.

Starlette's ServerErrorMiddleware generates the response for an unhandled
exception *outside* CORSMiddleware, and the exception bypasses CORS's send
wrapper — so the 500 carries no `Access-Control-Allow-Origin`. The browser then
reports an opaque "Failed to fetch" instead of a real 500, hiding the actual
error. A catch-all handler runs in ServerErrorMiddleware too, so it must set the
CORS headers itself."""
import logging

from fastapi import Request
from fastapi.responses import JSONResponse

from app.core.config import settings

logger = logging.getLogger(__name__)


def _cors_headers_for(request: Request) -> dict[str, str]:
    """CORS headers mirroring CORSMiddleware for a credentialed request: echo an
    allowed Origin and allow credentials. Returns no headers when the request has
    no Origin or the Origin is not allowed (same as a blocked cross-origin call)."""
    origin = request.headers.get("origin")
    if not origin:
        return {}
    allowed = settings.BACKEND_CORS_ORIGINS
    if isinstance(allowed, str):
        allowed = [allowed]
    if origin in allowed or "*" in allowed:
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Vary": "Origin",
        }
    return {}


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Return a real 500 (with CORS headers) for any otherwise-unhandled
    exception, so the frontend sees a status + detail rather than "Failed to
    fetch". The full traceback is logged here; the client gets a generic message
    so internals aren't leaked."""
    logger.error(
        "Unhandled exception on %s %s", request.method, request.url.path, exc_info=exc
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Sunucu hatası oluştu."},
        headers=_cors_headers_for(request),
    )
