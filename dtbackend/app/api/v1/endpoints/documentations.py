"""
Documentation API Endpoints

CRUD operations for managing platform documentation
"""

from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import check_authenticated
from app.core.database import get_postgres_db
from app.models.postgres_models import User
from app.schemas.documentation import (
    Documentation as DocumentationSchema,
)
from app.schemas.documentation import (
    DocumentationCreate,
    DocumentationList,
    DocumentationStats,
    DocumentationUpdate,
    DocumentationUploadResponse,
)
from app.services.documentation_service import DocumentationService

router = APIRouter()


@router.get("/", response_model=DocumentationList)
async def get_documentations(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=500, description="Maximum number of records to return"),
    platform_id: Optional[int] = Query(None, description="Filter by platform ID"),
    category: Optional[str] = Query(None, description="Filter by category"),
    file_type: Optional[str] = Query(None, description="Filter by file type (video, document, image)"),
    search: Optional[str] = Query(None, description="Search in title, description, filename"),
    tags: Optional[str] = Query(None, description="Comma-separated tags to filter by"),
    include_inactive: bool = Query(False, description="Include inactive documentation"),
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated),
):
    """
    Get list of documentations with filtering and pagination
    """
    # Parse tags if provided
    tag_list = tags.split(",") if tags else None

    documentations = await DocumentationService.get_documentations(
        db=db,
        skip=skip,
        limit=limit,
        platform_id=platform_id,
        category=category,
        file_type=file_type,
        search=search,
        tags=tag_list,
        include_inactive=include_inactive,
    )
    return documentations


@router.get("/stats", response_model=DocumentationStats)
async def get_documentation_stats(
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated),
):
    """
    Get documentation statistics
    """
    stats = await DocumentationService.get_documentation_stats(db)
    return stats


@router.get("/categories", response_model=list[str])
async def get_categories(
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated),
):
    """
    Get all unique documentation categories
    """
    categories = await DocumentationService.get_categories(db)
    return categories


@router.get("/tags", response_model=list[str])
async def get_tags(
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated),
):
    """
    Get all unique tags used in documentations
    """
    tags = await DocumentationService.get_all_tags(db)
    return tags


@router.get("/{documentation_id}", response_model=DocumentationSchema)
async def get_documentation(
    documentation_id: int,
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated),
):
    """
    Get documentation by ID
    """
    documentation = await DocumentationService.get_documentation_by_id(db, documentation_id)
    if not documentation:
        raise HTTPException(status_code=404, detail="Documentation not found")
    return documentation


@router.post("/", response_model=DocumentationSchema, status_code=201)
async def create_documentation(
    documentation_data: DocumentationCreate,
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated),
):
    """
    Create new documentation entry
    """
    documentation = await DocumentationService.create_documentation(db, documentation_data)
    return documentation


@router.post("/upload", response_model=DocumentationUploadResponse)
async def upload_documentation(
    file: UploadFile = File(...),
    title: str = Form(...),
    description: Optional[str] = Form(None),
    platform_id: Optional[int] = Form(None),
    category: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    order_index: int = Form(0),
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated),
):
    """
    Upload a file to PocketBase and create documentation entry
    
    - **file**: File to upload (video, document, or image)
    - **title**: Title of the documentation
    - **description**: Optional description
    - **platform_id**: Optional platform association
    - **category**: Optional category
    - **tags**: Comma-separated tags
    - **order_index**: Display order (default: 0)
    """
    # Determine file type based on content type
    content_type = file.content_type or ""
    if content_type.startswith("video/"):
        file_type = "video"
    elif content_type.startswith("image/"):
        file_type = "image"
    elif content_type in [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain",
    ]:
        file_type = "document"
    else:
        file_type = "document"  # Default to document

    # Read file content
    file_content = await file.read()
    file_size = len(file_content)

    # Upload to PocketBase
    try:
        file_url = await DocumentationService.upload_to_pocketbase(
            file_content, file.filename or "file"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to upload file to PocketBase: {str(e)}"
        )

    # Parse tags
    tag_list = [tag.strip() for tag in tags.split(",")] if tags else []

    # Create documentation entry
    documentation_data = DocumentationCreate(
        title=title,
        description=description,
        platform_id=platform_id,
        file_url=file_url,
        file_type=file_type,
        file_name=file.filename or "file",
        file_size=file_size,
        category=category,
        tags=tag_list,
        uploaded_by=current_user.username,
        is_active=True,
        order_index=order_index,
    )

    documentation = await DocumentationService.create_documentation(db, documentation_data)

    return DocumentationUploadResponse(
        documentation_id=documentation.id,
        file_url=file_url,
        message="Documentation uploaded successfully",
    )


@router.put("/{documentation_id}", response_model=DocumentationSchema)
async def update_documentation(
    documentation_id: int,
    documentation_data: DocumentationUpdate,
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated),
):
    """
    Update documentation
    """
    documentation = await DocumentationService.update_documentation(
        db, documentation_id, documentation_data
    )
    if not documentation:
        raise HTTPException(status_code=404, detail="Documentation not found")
    return documentation


@router.delete("/{documentation_id}")
async def delete_documentation(
    documentation_id: int,
    hard_delete: bool = Query(
        False, description="If True, permanently delete. If False, soft delete (default)"
    ),
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated),
):
    """
    Delete documentation
    """
    success = await DocumentationService.delete_documentation(
        db, documentation_id, soft_delete=not hard_delete
    )
    if not success:
        raise HTTPException(status_code=404, detail="Documentation not found")

    delete_type = "permanently deleted" if hard_delete else "deactivated"
    return {
        "success": True,
        "message": f"Documentation {delete_type} successfully",
        "documentation_id": documentation_id,
    }


@router.post("/{documentation_id}/view")
async def increment_view_count(
    documentation_id: int,
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated),
):
    """
    Increment view count for documentation
    """
    success = await DocumentationService.increment_view_count(db, documentation_id)
    if not success:
        raise HTTPException(status_code=404, detail="Documentation not found")
    return {"success": True, "message": "View count incremented"}


@router.post("/{documentation_id}/download")
async def increment_download_count(
    documentation_id: int,
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated),
):
    """
    Increment download count for documentation
    """
    success = await DocumentationService.increment_download_count(db, documentation_id)
    if not success:
        raise HTTPException(status_code=404, detail="Documentation not found")
    return {"success": True, "message": "Download count incremented"}


@router.patch("/{documentation_id}/activate", response_model=DocumentationSchema)
async def activate_documentation(
    documentation_id: int,
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated),
):
    """
    Activate documentation (set is_active = True)
    """
    documentation_data = DocumentationUpdate(is_active=True)
    documentation = await DocumentationService.update_documentation(
        db, documentation_id, documentation_data
    )
    if not documentation:
        raise HTTPException(status_code=404, detail="Documentation not found")
    return documentation


@router.patch("/{documentation_id}/deactivate", response_model=DocumentationSchema)
async def deactivate_documentation(
    documentation_id: int,
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated),
):
    """
    Deactivate documentation (set is_active = False)
    """
    documentation_data = DocumentationUpdate(is_active=False)
    documentation = await DocumentationService.update_documentation(
        db, documentation_id, documentation_data
    )
    if not documentation:
        raise HTTPException(status_code=404, detail="Documentation not found")
    return documentation
