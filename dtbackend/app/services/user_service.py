import base64
import json
from typing import Any, List
from urllib.parse import unquote

import httpx
from Crypto.Cipher import AES
from Crypto.Util.Padding import unpad
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.auth import create_secure_request
from app.models.postgres_models import User


class UserService:

    @staticmethod
    async def handle_login_redirect(
        tokens: str,
        secret: str,
        client_redirect: str | None = None
    ) -> dict[str, Any]:
        """
        Handle SAML login redirect with token decryption

        Args:
            tokens: Encrypted tokens from auth server
            secret: SAML token for verification
            client_redirect: Optional client redirect URL

        Returns:
            Dictionary containing access_token, refresh_token, and redirect_url

        Raises:
            HTTPException: For various authentication errors
        """

        # Validate required parameters
        if not tokens or not secret:
            raise HTTPException(
                status_code=status.HTTP_417_EXPECTATION_FAILED,
                detail="Redirect Token and Secret is missing"
            )

        # Verify SAML token with auth server
        saml_response = await UserService._verify_saml_token(secret)

        # Decrypt tokens using the key from SAML response
        decrypted_tokens = await UserService._decrypt_tokens(tokens, saml_response)

        # Prepare response data
        response_data = {
            "access_token": decrypted_tokens["access_token"],
            "refresh_token": decrypted_tokens["refresh_token"],
            "redirect_url": client_redirect or settings.CORS_ORIGIN
        }

        return response_data

    @staticmethod
    async def _verify_saml_token(secret: str) -> str:
        """
        Verify SAML token with auth server

        Args:
            secret: SAML token to verify

        Returns:
            Response data from auth server

        Raises:
            HTTPException: If verification fails
        """
        try:
            # Prepare proxy configuration if provided
            proxy_config = None
            if settings.AUTH_SERVER_PROXY_HOST and settings.AUTH_SERVER_PROXY_PORT:
                proxy_config = {
                    "http://": f"http://{settings.AUTH_SERVER_PROXY_HOST}:{settings.AUTH_SERVER_PROXY_PORT}",
                    "https://": f"http://{settings.AUTH_SERVER_PROXY_HOST}:{settings.AUTH_SERVER_PROXY_PORT}"
                }

            async with httpx.AsyncClient(proxies=proxy_config, verify=False) as client:
                response = await client.get(
                    f"{settings.AUTH_SERVER_URL}/auth/saml_checker",
                    params={"saml_token": secret}
                )
                response.raise_for_status()
                return response.text

        except httpx.HTTPStatusError as e:
            error_message = "Authentication failed"
            try:
                error_data = e.response.json()
                if "message" in error_data:
                    error_message = error_data["message"]
            except:
                error_message = str(e)

            raise HTTPException(
                status_code=e.response.status_code,
                detail=error_message
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to verify SAML token: {e!s}"
            )

    @staticmethod
    async def _decrypt_tokens(tokens: str, decryption_key: str) -> dict[str, str]:
        """
        Decrypt tokens using AES decryption

        Args:
            tokens: Encrypted tokens (base64 encoded)
            decryption_key: Key for decryption

        Returns:
            Dictionary containing decrypted access_token and refresh_token

        Raises:
            HTTPException: If decryption fails
        """
        try:
            # Decode URI component and parse base64
            tokens_decoded_uri = unquote(tokens)
            encrypted_bytes = base64.b64decode(tokens_decoded_uri)

            # Extract IV (first 16 bytes) and ciphertext
            iv = encrypted_bytes[:16]
            ciphertext = encrypted_bytes[16:]

            # Prepare decryption key
            key = decryption_key.encode('utf-8')

            # Decrypt using AES CBC mode
            cipher = AES.new(key, AES.MODE_CBC, iv)
            decrypted_bytes = cipher.decrypt(ciphertext)

            # Remove padding
            decrypted_bytes = unpad(decrypted_bytes, AES.block_size)

            # Parse JSON
            decrypted_text = decrypted_bytes.decode('utf-8')
            decrypted_json = json.loads(decrypted_text)

            # Validate required fields
            if "access_token" not in decrypted_json or "refresh_token" not in decrypted_json:
                raise ValueError("Missing required tokens in decrypted data")

            return {
                "access_token": decrypted_json["access_token"],
                "refresh_token": decrypted_json["refresh_token"]
            }

        except json.JSONDecodeError:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="JSON couldn't be parsed"
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Token decryption failed: {e!s}"
            )

    @staticmethod
    async def get_user_by_id(db: AsyncSession, user_id: int) -> User | None:
        """Get user by ID"""
        query = select(User).where(User.id == user_id)
        result = await db.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_user_by_username(db: AsyncSession, username: str) -> User | None:
        """Get user by username"""
        query = select(User).where(User.username == username)
        result = await db.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def create_user(db: AsyncSession, username: str) -> User:
        """Create a new user"""
        db_user = User(username=username)
        db.add(db_user)
        await db.commit()
        await db.refresh(db_user)
        return db_user

    @staticmethod
    async def increment_login_count(db: AsyncSession, user: User) -> User:
        """
        Increment login count and update last login timestamp for a user
        
        Args:
            db: Database session
            user: User object to update
            
        Returns:
            Updated User object
        """
        from sqlalchemy.sql import func
        
        user.login_count = (user.login_count or 0) + 1
        user.last_login_at = func.now()
        
        await db.commit()
        await db.refresh(user)
        return user

    @staticmethod
    async def retrieve_all_departments(username: str) -> List[str]:
        """
        Retrieve all departments from auth server using secure request
        
        Args:
            username: Username to retrieve departments for
            
        Returns:
            List of department names
            
        Raises:
            HTTPException: If the request fails
        """
        # Create secure request and get secret key
        secret_key = await create_secure_request()
        
        try:
            # Prepare proxy configuration if provided
            proxy_config = None
            if settings.AUTH_SERVER_PROXY_HOST and settings.AUTH_SERVER_PROXY_PORT:
                proxy_config = {
                    "http://": f"http://{settings.AUTH_SERVER_PROXY_HOST}:{settings.AUTH_SERVER_PROXY_PORT}",
                    "https://": f"http://{settings.AUTH_SERVER_PROXY_HOST}:{settings.AUTH_SERVER_PROXY_PORT}"
                }
            
            async with httpx.AsyncClient(proxies=proxy_config, verify=False) as client:
                response = await client.post(
                    f"{settings.AUTH_SERVER_URL}/search/retrieveAllDepartments",
                    json={"username": username},
                    headers={"Authorization": secret_key}
                )
                response.raise_for_status()
                return response.json()
                
        except httpx.HTTPStatusError as e:
            error_message = "Failed to retrieve departments"
            try:
                error_data = e.response.json()
                if "message" in error_data:
                    error_message = error_data["message"]
                elif "detail" in error_data:
                    error_message = error_data["detail"]
            except:
                error_message = str(e)
                
            raise HTTPException(
                status_code=e.response.status_code,
                detail=error_message
            )
        except httpx.TimeoutException:
            raise HTTPException(
                status_code=status.HTTP_408_REQUEST_TIMEOUT,
                detail="Auth server timeout"
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to retrieve departments: {str(e)}"
            )

    @staticmethod
    async def search_user(search: str) -> Any:
        """
        Search for users in the auth server using secure request
        
        Args:
            search: Search term for user name
            
        Returns:
            List of user information dictionaries
            
        Raises:
            HTTPException: If the request fails
        """
        # Create secure request and get secret key
        secret_key = await create_secure_request()
        
        try:
            # Prepare proxy configuration if provided
            proxy_config = None
            if settings.AUTH_SERVER_PROXY_HOST and settings.AUTH_SERVER_PROXY_PORT:
                proxy_config = {
                    "http://": f"http://{settings.AUTH_SERVER_PROXY_HOST}:{settings.AUTH_SERVER_PROXY_PORT}",
                    "https://": f"http://{settings.AUTH_SERVER_PROXY_HOST}:{settings.AUTH_SERVER_PROXY_PORT}"
                }
            
            # Simple Turkish upper case handling for i -> İ
            # This is a basic approximation since Python's upper() maps i -> I
            search_upper = search.replace('i', 'İ').upper()
            
            url = f"{settings.AUTH_SERVER_URL}/search/searchData"
            payload = {
                "collection": "users",
                "filter": f'name ~ "%{search}%" || name ~ "%{search_upper}%"'
            }
            
            async with httpx.AsyncClient(proxies=proxy_config, verify=False) as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers={"Authorization": secret_key}
                )
                
                response.raise_for_status()
                return response.json()
                
        except httpx.HTTPStatusError as e:
            error_message = "Failed to search users"
            try:
                error_data = e.response.json()
                if "message" in error_data:
                    error_message = error_data["message"]
                elif "detail" in error_data:
                    error_message = error_data["detail"]
            except:
                error_message = str(e)
                
            raise HTTPException(
                status_code=e.response.status_code,
                detail=error_message
            )
        except httpx.TimeoutException:
            raise HTTPException(
                status_code=status.HTTP_408_REQUEST_TIMEOUT,
                detail="Auth server timeout"
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to search users: {str(e)}"
            )

    