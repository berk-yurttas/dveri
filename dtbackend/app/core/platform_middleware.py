"""
Platform Middleware for Multi-Tenant Platform Support

Extracts and validates platform context from:
1. HTTP Header: X-Platform-Code
2. Query Parameter: ?platform=deriniz
3. Subdomain: deriniz.yourdomain.com
4. Default from configuration

The platform is stored in request.state for use in endpoints.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request
from sqlalchemy import select
from app.models.postgres_models import Platform
from app.core.database import AsyncSessionLocal
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


class PlatformMiddleware(BaseHTTPMiddleware):
    """
    Middleware to extract and validate platform context for each request.
    
    The platform_code is extracted from (in order of priority):
    1. X-Platform-Code header
    2. platform query parameter
    3. Subdomain (e.g., deriniz.example.com)
    4. Default platform from settings
    
    The platform object is stored in request.state for downstream use.
    """
    
    async def dispatch(self, request: Request, call_next):
        platform_code = None
        
        # 1. Try header first (highest priority)
        platform_code = request.headers.get("X-Platform-Code")
        if platform_code:
            logger.debug(f"Platform code from header: {platform_code}")
        
        # 2. Try query parameter
        if not platform_code:
            platform_code = request.query_params.get("platform")
            if platform_code:
                logger.debug(f"Platform code from query param: {platform_code}")
        
        # 3. Try subdomain extraction
        if not platform_code:
            host = request.headers.get("host", "")
            if "." in host:
                subdomain = host.split(".")[0]
                # Exclude common subdomains that aren't platform codes
                excluded_subdomains = ["www", "api", "localhost", "127", "admin"]
                if subdomain not in excluded_subdomains and not subdomain.isdigit():
                    platform_code = subdomain
                    logger.debug(f"Platform code from subdomain: {platform_code}")
        
        # 4. If no platform code found, continue without platform context
        if not platform_code:
            logger.debug("No platform code found, continuing without platform context")
            request.state.platform_code = None
            request.state.platform = None
            request.state.platform_id = None
            response = await call_next(request)
            return response
        
        # Store platform_code in request state
        request.state.platform_code = platform_code
        
        # Fetch and validate platform from database
        try:
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(Platform).where(
                        Platform.code == platform_code,
                        Platform.is_active == True
                    )
                )
                platform = result.scalar_one_or_none()
                
                if platform:
                    # Store full platform object in request state
                    request.state.platform = platform
                    request.state.platform_id = platform.id
                    logger.debug(f"Platform found: {platform.name} (ID: {platform.id})")
                else:
                    # Platform not found or inactive
                    logger.warning(f"Platform not found or inactive: {platform_code}")
                    request.state.platform = None
                    request.state.platform_id = None
                    
                    # For non-critical endpoints, continue without platform
                    # Critical endpoints should check request.state.platform and return 404
        
        except Exception as e:
            logger.error(f"Error fetching platform: {str(e)}")
            request.state.platform = None
            request.state.platform_id = None
        
        # Continue with request processing
        response = await call_next(request)
        
        # Optionally add platform info to response headers
        if hasattr(request.state, 'platform') and request.state.platform:
            try:
                response.headers["X-Platform-Code"] = request.state.platform_code
                # Encode platform name to ASCII, replacing non-ASCII chars
                platform_name = request.state.platform.name.encode('ascii', 'replace').decode('ascii')
                response.headers["X-Platform-Name"] = platform_name
            except Exception as e:
                # If header setting fails, log but don't break the request
                logger.debug(f"Could not set platform headers: {str(e)}")
        
        return response


async def get_current_platform(request: Request) -> Platform:
    """
    FastAPI dependency to get current platform from request state.
    
    Usage:
        @router.get("/data")
        async def get_data(platform: Platform = Depends(get_current_platform)):
            # Use platform object
            pass
    
    Raises:
        HTTPException: 404 if platform not found
    """
    
    if not hasattr(request.state, 'platform') or request.state.platform is None:
        return None
    
    return request.state.platform


async def get_optional_platform(request: Request) -> Platform | None:
    """
    FastAPI dependency to get current platform from request state (optional).
    
    Returns None if platform not found, doesn't raise exception.
    
    Usage:
        @router.get("/data")
        async def get_data(platform: Platform | None = Depends(get_optional_platform)):
            if platform:
                # Platform-specific logic
                pass
            else:
                # Default/fallback logic
                pass
    """
    return getattr(request.state, 'platform', None)


def get_platform_code(request: Request) -> str:
    """
    FastAPI dependency to get platform code from request state.
    
    Usage:
        @router.get("/data")
        async def get_data(platform_code: str = Depends(get_platform_code)):
            # Use platform_code string
            pass
    """
    return getattr(request.state, 'platform_code', settings.DEFAULT_PLATFORM)

