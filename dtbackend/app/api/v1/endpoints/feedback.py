"""
Feedback API Endpoints

Handles feedback submission to OpenProject.
"""

import logging
import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from app.core.auth import check_authenticated
from app.core.config import settings
from app.models.postgres_models import User
from app.schemas.feedback import FeedbackCreate, FeedbackResponse
from app.services.feedback_service import FeedbackService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/", response_model=FeedbackResponse, status_code=200)
async def send_feedback(
    feedback_data: FeedbackCreate,
    current_user: User = Depends(check_authenticated)
):
    """
    Submit feedback to OpenProject
    
    - **subject**: Sorun başlığı (required)
    - **description**: Sorun detayı (required)
    
    Creates a work package in OpenProject and adds it to the specified board column.
    """
    try:
        logger.info(f"Feedback submission request from user: {current_user.username}")
        result = await FeedbackService.submit_feedback(feedback_data)
        logger.info(f"Feedback submitted successfully: {result.work_package_id}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Unexpected error in send_feedback endpoint: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Feedback gönderilirken bir hata oluştu: {str(e)}"
        )


@router.post("/upload-file")
async def upload_feedback_file(
    file: UploadFile = File(...),
    current_user: User = Depends(check_authenticated)
):
    """
    Upload a file to PocketBase files collection and return the URL
    
    - **file**: File to upload
    
    Returns:
        - **url**: Full URL to access the uploaded file
        - **record_id**: PocketBase record ID
        - **filename**: Uploaded filename
    """
    try:
        async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
            # 1. Admin authentication (if credentials provided)
            auth_token = None
            if settings.POCKETBASE_ADMIN_EMAIL and settings.POCKETBASE_ADMIN_PASSWORD:
                try:
                    auth_response = await client.post(
                        f"{settings.POCKETBASE_URL}/api/admins/auth-with-password",
                        json={
                            "identity": settings.POCKETBASE_ADMIN_EMAIL,
                            "password": settings.POCKETBASE_ADMIN_PASSWORD
                        }
                    )
                    if auth_response.status_code == 200:
                        auth_token = auth_response.json().get("token")
                except Exception as auth_error:
                    logger.warning(f"PocketBase auth warning: {auth_error}")

            # 2. Upload file to PocketBase
            file_content = await file.read()
            
            # Prepare file for upload (document field in files collection)
            files = {
                "document": (file.filename, file_content, file.content_type or "application/octet-stream")
            }
            
            headers = {}
            if auth_token:
                headers["Authorization"] = auth_token
                
            # Upload to PocketBase files collection
            upload_response = await client.post(
                f"{settings.POCKETBASE_URL}/api/collections/files/records",
                files=files,
                headers=headers
            )
            
            if upload_response.status_code in [200, 201]:
                data = upload_response.json()
                
                # Construct file URL: /api/files/{collectionName}/{recordId}/{filename}
                file_url = f"{settings.POCKETBASE_SAVE_URL}/api/files/files/{data['id']}/{data['document']}"
                
                return {
                    "url": file_url,
                    "record_id": data['id'],
                    "filename": data['document']
                }
            else:
                error_detail = upload_response.text
                logger.error(f"PocketBase upload failed: {error_detail}")
                raise HTTPException(
                    status_code=upload_response.status_code,
                    detail=f"Dosya yükleme hatası: {error_detail}"
                )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error uploading file: {e!s}")
        raise HTTPException(
            status_code=500,
            detail=f"Dosya yüklenirken bir hata oluştu: {str(e)}"
        )

