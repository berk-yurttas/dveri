"""
Feedback API Endpoints

Handles feedback submission to OpenProject.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from app.core.auth import check_authenticated
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

