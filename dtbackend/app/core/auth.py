import traceback
from typing import Optional, Dict, Any
import httpx
import time
from fastapi import Request, HTTPException, status, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from app.core.config import settings
from app.schemas.user import User

security = HTTPBearer()

# Simple in-memory cache for token validation
token_cache = {}
CACHE_DURATION = 300  # 5 minutes

def cleanup_token_cache():
    """Remove expired entries from token cache"""
    current_time = time.time()
    expired_tokens = []
    
    for token, (data, cached_time) in token_cache.items():
        if current_time - cached_time > CACHE_DURATION:
            expired_tokens.append(token)
    
    for token in expired_tokens:
        del token_cache[token]

async def verify_access_token_locally(token: str) -> Optional[Dict[str, Any]]:
    """
    Fast local JWT token verification (no HTTP call)
    """
    try:
        payload = jwt.decode(
            token,
            key="dummy_key",
            options={"verify_signature": False}
        )
        
        # Check if token is expired
        if payload.get("exp") and payload.get("exp") < time.time():
            return None
            
        return payload
        
    except JWTError:
        return None

async def verify_access_token_with_cache(token: str) -> Dict[str, Any]:
    """
    Verify access token with caching and fallback to auth server
    """
    current_time = time.time()
    
    
    # Fallback to auth server verification (slow)
    try:
        client = await get_http_client()
        response = await client.get(
            f"{settings.AUTH_SERVER_URL}/auth/verify",
            headers={"Authorization": token}
        )
        response.raise_for_status()
        user_data = response.json()
        
        # Cache the result
        token_cache[token] = (user_data, current_time)
        return user_data
        
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_408_REQUEST_TIMEOUT,
            detail="Auth server timeout"
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail="Token verification failed"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to verify token: {str(e)}"
        )

# Global HTTP client for connection reuse
_http_client = None

async def get_http_client():
    """Get or create a reusable HTTP client"""
    global _http_client
    if _http_client is None:
        proxy_config = None
        if settings.AUTH_SERVER_PROXY_HOST and settings.AUTH_SERVER_PROXY_PORT:
            proxy_config = {
                "http://": f"http://{settings.AUTH_SERVER_PROXY_HOST}:{settings.AUTH_SERVER_PROXY_PORT}",
                "https://": f"http://{settings.AUTH_SERVER_PROXY_HOST}:{settings.AUTH_SERVER_PROXY_PORT}"
            }
        
        _http_client = httpx.AsyncClient(
            proxies=proxy_config,
            timeout=httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0),
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=100),
            http2=True,  # Enable HTTP/2 for better performance
        )
    
    return _http_client

async def verify_access_token(token: str) -> Dict[str, Any]:
    """
    Verify access token with auth server
    
    Args:
        token: Access token to verify
        
    Returns:
        User data from auth server response
        
    Raises:
        HTTPException: If verification fails
    """
    try:
        client = await get_http_client()
        
        response = await client.get(
            f"{settings.AUTH_SERVER_URL}/auth/verify",
            headers={"Authorization": token}
        )
        response.raise_for_status()
        return response.json()
            
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_408_REQUEST_TIMEOUT,
            detail="Auth server timeout"
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail="Token verification failed"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to verify token: {str(e)}"
        )

async def refresh_access_token(refresh_token: str) -> Dict[str, str]:
    """
    Refresh access token using refresh token
    
    Args:
        refresh_token: Refresh token
        
    Returns:
        Dictionary containing new access_token and refresh_token
        
    Raises:
        HTTPException: If refresh fails
    """
    try:
        # Prepare proxy configuration if provided
        proxy_config = None
        if settings.AUTH_SERVER_PROXY_HOST and settings.AUTH_SERVER_PROXY_PORT:
            proxy_config = {
                "http://": f"http://{settings.AUTH_SERVER_PROXY_HOST}:{settings.AUTH_SERVER_PROXY_PORT}",
                "https://": f"http://{settings.AUTH_SERVER_PROXY_HOST}:{settings.AUTH_SERVER_PROXY_PORT}"
            }
        
        async with httpx.AsyncClient(proxies=proxy_config) as client:
            response = await client.get(
                f"{settings.AUTH_SERVER_URL}/auth/refresh",
                headers={"Authorization": refresh_token}
            )
            response.raise_for_status()
            return response.json()
            
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token expired"
            )
        raise HTTPException(
            status_code=e.response.status_code,
            detail="Token refresh failed"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to refresh token: {str(e)}"
        )

async def get_current_user_with_refresh(request: Request, response: Response) -> Optional[User]:
    """
    Get current user from cookies with automatic token refresh capability
    
    Args:
        request: FastAPI request object
        response: FastAPI response object (for setting new cookies)
        
    Returns:
        User object if authenticated, None otherwise
        
    Raises:
        HTTPException: For authentication errors
    """
    access_token = request.cookies.get("access_token")
    refresh_token = request.cookies.get("refresh_token")
    
    # If no tokens at all, user is not authenticated
    if not access_token and not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Logine Yönlendiriliyor",
            headers={"redirect": "true"}
        )
    
    # Try to verify access token first
    if access_token:
        try:
            user_data = await verify_access_token_with_cache(access_token)
            user = User.from_jwt_payload(user_data)
            return user
            
        except HTTPException as e:
            # If access token failed and it's a 401, try refresh token
            if e.status_code == 401 and refresh_token:
                try:
                    # Refresh the tokens
                    new_tokens = await refresh_access_token(refresh_token)

                    # Set new cookies
                    cookie_domain = None if settings.COOKIE_DOMAIN == "localhost" else settings.COOKIE_DOMAIN
                    
                    response.set_cookie(
                        key="access_token",
                        value=new_tokens["access_token"],
                        domain=cookie_domain,
                        httponly=True,
                        path="/",
                        max_age=60 * 60 * 24 * 10,  # 10 days
                        secure=False,  # Set to True in production with HTTPS
                        samesite="lax"
                    )
                    
                    response.set_cookie(
                        key="refresh_token",
                        value=new_tokens["refresh_token"],
                        domain=cookie_domain,
                        httponly=True,
                        path="/",
                        max_age=60 * 60 * 24 * 10,  # 10 days
                        secure=False,  # Set to True in production with HTTPS
                        samesite="lax"
                    )

                    # Verify the new access token
                    try:
                        user_data = await verify_access_token_with_cache(new_tokens["access_token"])
                        user = User.from_jwt_payload(user_data)
                        return user
                        
                    except HTTPException:
                        raise HTTPException(
                            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail="Token yenileme hatası"
                        )
                        
                except HTTPException as refresh_error:
                    if refresh_error.status_code == 401:
                        raise HTTPException(
                            status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Logine Yönlendiriliyor",
                            headers={"redirect": "true"}
                        )
                    else:
                        raise HTTPException(
                            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail="Bir hata oluştu"
                        )
            else:
                # No refresh token available or other error
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Logine Yönlendiriliyor",
                    headers={"redirect": "true"}
                )
    
    # If we only have refresh token, try to use it
    elif refresh_token:
        try:
            new_tokens = await refresh_access_token(refresh_token)
            
            # Set new cookies
            cookie_domain = None if settings.COOKIE_DOMAIN == "localhost" else settings.COOKIE_DOMAIN
            
            response.set_cookie(
                key="access_token",
                value=new_tokens["access_token"],
                domain=cookie_domain,
                httponly=True,
                path="/",
                max_age=60 * 60 * 24 * 10,  # 10 days
                secure=False,
                samesite="lax"
            )
            
            response.set_cookie(
                key="refresh_token",
                value=new_tokens["refresh_token"],
                domain=cookie_domain,
                httponly=True,
                path="/",
                max_age=60 * 60 * 24 * 10,  # 10 days
                secure=False,
                samesite="lax"
            )
            # Verify the new access token
            user_data = await verify_access_token_with_cache(new_tokens["access_token"])
            user = User.from_jwt_payload(user_data)
            return user
            
        except HTTPException as refresh_error:
            if refresh_error.status_code == 401:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Logine Yönlendiriliyor",
                    headers={"redirect": "true"}
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Bir hata oluştu"
                )

async def check_authenticated(request: Request, response: Response) -> User:
    """
    Dependency to check if user is authenticated with automatic token refresh
    
    Args:
        request: FastAPI request object
        response: FastAPI response object (for setting new cookies)
        
    Returns:
        User object if authenticated
        
    Raises:
        HTTPException: If user is not authenticated
    """
    user = await get_current_user_with_refresh(request, response)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    return user
