from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Response, Request
from fastapi.responses import RedirectResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_postgres_db
from app.core.config import settings
from app.services.user_service import UserService
from app.core.auth import check_authenticated
from app.schemas.user import User

router = APIRouter()


@router.get("/login_redirect", dependencies=[])  # Empty dependencies to override global auth
async def login_redirect(
    response: Response,
    tokens: Optional[str] = Query(None, description="Encrypted tokens from auth server"),
    secret: Optional[str] = Query(None, description="SAML token for verification"),
    client_rdct: Optional[str] = Query(None, description="Client redirect URL"),
    db: AsyncSession = Depends(get_postgres_db)
):
    """
    Handle SAML login redirect with token decryption and cookie setting
    
    Query Parameters:
    - tokens: Encrypted tokens from auth server (required)
    - secret: SAML token for verification (required) 
    - client_rdct: Optional client redirect URL
    
    Returns:
    - Redirects to client application with authentication cookies set
    """
    
    try:
        # Handle login redirect and get decrypted tokens
        auth_data = await UserService.handle_login_redirect(
            tokens=tokens,
            secret=secret,
            client_redirect=client_rdct
        )
        
        print(f"Auth data received: {auth_data}")
        
        # Create redirect response
        redirect_response = RedirectResponse(
            url=auth_data["redirect_url"],
            status_code=status.HTTP_302_FOUND
        )
        
        # Set cookies on redirect response (remove domain if localhost)
        cookie_domain = None if settings.COOKIE_DOMAIN == "localhost" else settings.COOKIE_DOMAIN
        
        redirect_response.set_cookie(
            key="access_token",
            value=auth_data["access_token"],
            domain=cookie_domain,
            httponly=True,
            path="/",
            max_age=60 * 60 * 24 * 10,  # 10 days
            secure=False,  # Set to True in production with HTTPS
            samesite="lax"
        )
        
        redirect_response.set_cookie(
            key="refresh_token",
            value=auth_data["refresh_token"],
            domain=cookie_domain,
            httponly=True,
            path="/",
            max_age=60 * 60 * 24 * 10,  # 10 days
            secure=False,  # Set to True in production with HTTPS
            samesite="lax"
        )
        
        print(f"Cookies set, redirecting to: {auth_data['redirect_url']}")
        return redirect_response
        
    except HTTPException:
        # Re-raise HTTP exceptions from the service
        raise
    except Exception as e:
        # Handle any unexpected errors
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Login redirect failed: {str(e)}"
        )

@router.get("/login_jwt", response_model=User)
async def login_jwt(
    request: Request,
    response: Response,
    current_user: User = Depends(check_authenticated),
    db: AsyncSession = Depends(get_postgres_db)
):
    """
    Get current user information from JWT token
    
    Returns:
        User object containing authenticated user information
    
    Raises:
        HTTPException: If user is not authenticated or token is invalid
    """
    user = await UserService.get_user_by_username(db, current_user.username)
    if not user:
        print(f"User not found in database, creating user: {current_user.username}")
        user = await UserService.create_user(db, current_user.username)

    return current_user

@router.post("/logout", dependencies=[])  # Empty dependencies to override global auth
async def logout(response: Response):
    """
    Logout user by clearing authentication cookies
    """
    response.delete_cookie(
        key="access_token",
        domain=settings.COOKIE_DOMAIN,
        path="/"
    )
    response.delete_cookie(
        key="refresh_token", 
        domain=settings.COOKIE_DOMAIN,
        path="/"
    )
    
    return {"message": "Successfully logged out"}


@router.get("/profile")
async def get_user_profile(
    db: AsyncSession = Depends(get_postgres_db)
):
    """
    Get current user profile (placeholder for authenticated user)
    TODO: Add proper authentication middleware
    """
    # This is a placeholder - in a real implementation, you would:
    # 1. Extract user info from JWT token in cookies
    # 2. Validate the token
    # 3. Get user from database
    
    return {
        "message": "User profile endpoint - authentication not yet implemented",
        "note": "This endpoint requires JWT token validation middleware"
    }
