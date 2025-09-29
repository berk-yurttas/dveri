from typing import Optional, Dict, Any
import httpx
from urllib.parse import unquote
from Crypto.Cipher import AES
from Crypto.Util.Padding import unpad
import base64
import json
from fastapi import HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.models.postgres_models import User


class UserService:
    
    @staticmethod
    async def handle_login_redirect(
        tokens: str,
        secret: str,
        client_redirect: Optional[str] = None
    ) -> Dict[str, Any]:
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
            
            async with httpx.AsyncClient(proxies=proxy_config) as client:
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
                detail=f"Failed to verify SAML token: {str(e)}"
            )
    
    @staticmethod
    async def _decrypt_tokens(tokens: str, decryption_key: str) -> Dict[str, str]:
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
                detail=f"Token decryption failed: {str(e)}"
            )
    
    @staticmethod
    async def get_user_by_id(db: AsyncSession, user_id: int) -> Optional[User]:
        """Get user by ID"""
        query = select(User).where(User.id == user_id)
        result = await db.execute(query)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_user_by_username(db: AsyncSession, username: str) -> Optional[User]:
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
