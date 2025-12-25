from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.types import ASGIApp

from app.core.auth import get_current_user_with_refresh


class AuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, exclude_paths: list[str] | None = None):
        super().__init__(app)
        self.exclude_paths = exclude_paths or [
            "/api/v1/users/login_redirect",  # Login endpoint
            "/api/v1/users/logout",          # Logout endpoint
            "/health",                       # Health check
            "/",                            # Root endpoint
            "/docs",                        # Swagger docs
            "/openapi.json",                # OpenAPI schema
            "/redoc"                        # ReDoc docs
        ]

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # Skip auth for excluded paths
        if any(request.url.path.startswith(path) for path in self.exclude_paths):
            return await call_next(request)

        try:
            # Create a response object to pass to auth functions
            response = Response()

            # Try to get current user (this will handle token refresh if needed)
            user = await get_current_user_with_refresh(request, response)

            # Store user in request state
            request.state.user = user

            # Get the response from the endpoint
            endpoint_response = await call_next(request)

            # Copy any cookies set during auth to the endpoint response
            if response.headers.get("set-cookie"):
                endpoint_response.headers["set-cookie"] = response.headers["set-cookie"]

            return endpoint_response

        except Exception as e:
            # Log the error for debugging
            print(f"Auth middleware error: {e!s}")

            # Continue to endpoint if auth fails - endpoints can handle auth requirements
            # This allows endpoints to decide if they need auth or not
            request.state.user = None
            return await call_next(request)
