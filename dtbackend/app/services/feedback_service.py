"""
Feedback Service

Handles feedback submission and integration with OpenProject.
"""

import httpx
import json
from typing import Optional
from fastapi import HTTPException
import logging

from app.core.config import settings
from app.schemas.feedback import FeedbackCreate, FeedbackResponse

logger = logging.getLogger(__name__)


class FeedbackService:
    """Service for handling feedback submissions to OpenProject"""
    
    @staticmethod
    async def submit_feedback(feedback_data: FeedbackCreate) -> FeedbackResponse:
        """
        Submit feedback to OpenProject as a work package
        
        Args:
            feedback_data: Feedback data containing subject and description
            
        Returns:
            FeedbackResponse with success status and work package ID
            
        Raises:
            HTTPException: If OpenProject API call fails
        """
        try:
            # Validate settings
            if not settings.OPENPROJECT_URL:
                raise HTTPException(
                    status_code=500,
                    detail="OpenProject URL yapılandırılmamış"
                )
            if not settings.OPENPROJECT_API_TOKEN:
                raise HTTPException(
                    status_code=500,
                    detail="OpenProject API token yapılandırılmamış"
                )
            
            # Setup authentication
            auth = ("apikey", settings.OPENPROJECT_API_TOKEN)
            
            # 1) Create work package with subject and description
            payload_wp = {
                "subject": feedback_data.subject,
                "description": {
                    "format": "markdown",
                    "raw": feedback_data.description
                },
                "_links": {
                    "type": {"href": "/api/v3/types/1"},
                    "project": {"href": f"/api/v3/projects/{settings.OPENPROJECT_PROJECT_ID}"}
                }
            }
            
            # Create work package using httpx (async)
            async with httpx.AsyncClient(timeout=30.0) as client:
                try:
                    resp_wp = await client.post(
                        f"{settings.OPENPROJECT_URL}/api/v3/work_packages",
                        headers={"Content-Type": "application/json"},
                        json=payload_wp,
                        auth=auth
                    )
                    
                    # Check if work package creation was successful
                    if resp_wp.status_code not in [200, 201]:
                        error_text = resp_wp.text
                        logger.error(f"OpenProject API error: {resp_wp.status_code} - {error_text}")
                        raise HTTPException(
                            status_code=500,
                            detail=f"OpenProject API hatası: {resp_wp.status_code} - {error_text[:200]}"
                        )
                    
                    wp_data = resp_wp.json()
                    wp_id = wp_data.get("id")
                    
                    if not wp_id:
                        logger.error(f"No work package ID returned: {wp_data}")
                        raise HTTPException(
                            status_code=500,
                            detail="Work package oluşturulamadı: ID döndürülmedi"
                        )
                    
                    logger.info(f"Work package created successfully: {wp_id}")
                    
                    # 2) Add work package to board column
                    payload = {
                        "delta": {
                            str(wp_id): "-1234435"
                        }
                    }
                    
                    try:
                        resp_order = await client.patch(
                            f"{settings.OPENPROJECT_URL}/api/v3/queries/{settings.OPENPROJECT_COLUMN_QUERY_ID}/order",
                            headers={"Content-Type": "application/json"},
                            json=payload,
                            auth=auth
                        )
                        
                        # Note: If adding to board fails, we still return success since the work package was created
                        if resp_order.status_code not in [200, 204]:
                            logger.warning(f"Failed to add work package to board: {resp_order.status_code} - {resp_order.text}")
                        else:
                            logger.info(f"Work package {wp_id} added to board successfully")
                    except Exception as board_error:
                        # Log but don't fail if board update fails
                        logger.warning(f"Failed to add work package to board: {str(board_error)}")
                    
                    return FeedbackResponse(
                        success=True,
                        message="Geri bildirim başarıyla gönderildi.",
                        work_package_id=wp_id
                    )
                    
                except httpx.TimeoutException:
                    logger.error("OpenProject API timeout")
                    raise HTTPException(
                        status_code=500,
                        detail="OpenProject API'ye bağlanırken zaman aşımı oluştu"
                    )
                except httpx.RequestError as e:
                    logger.error(f"OpenProject connection error: {str(e)}")
                    raise HTTPException(
                        status_code=500,
                        detail=f"OpenProject bağlantı hatası: {str(e)}"
                    )
            
        except HTTPException:
            raise
        except Exception as e:
            logger.exception(f"Unexpected error in submit_feedback: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Feedback gönderilirken bir hata oluştu: {str(e)}"
            )

