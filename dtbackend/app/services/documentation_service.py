"""
Documentation Service

Handles business logic for documentation management including CRUD operations,
file uploads to PocketBase, statistics, and more.
"""

import os
from typing import Optional

import httpx
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.postgres_models import Documentation, Platform
from app.schemas.documentation import (
    DocumentationCreate,
    DocumentationList,
    DocumentationStats,
    DocumentationUpdate,
)


class DocumentationService:
    """Service for managing documentation"""

    @staticmethod
    async def get_documentations(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 50,
        platform_id: Optional[int] = None,
        category: Optional[str] = None,
        file_type: Optional[str] = None,
        search: Optional[str] = None,
        tags: Optional[list[str]] = None,
        include_inactive: bool = False,
    ) -> DocumentationList:
        """
        Get paginated list of documentations with filters
        """
        # Build query
        query = select(Documentation)

        # Apply filters
        conditions = []
        if not include_inactive:
            conditions.append(Documentation.is_active == True)
        if platform_id:
            conditions.append(Documentation.platform_id == platform_id)
        if category:
            conditions.append(Documentation.category == category)
        if file_type:
            conditions.append(Documentation.file_type == file_type)
        if search:
            search_term = f"%{search}%"
            conditions.append(
                or_(
                    Documentation.title.ilike(search_term),
                    Documentation.description.ilike(search_term),
                    Documentation.file_name.ilike(search_term),
                )
            )
        if tags:
            # Match any of the provided tags
            conditions.append(Documentation.tags.overlap(tags))

        if conditions:
            query = query.where(and_(*conditions))

        # Get total count
        count_query = select(func.count()).select_from(Documentation)
        if conditions:
            count_query = count_query.where(and_(*conditions))
        total_result = await db.execute(count_query)
        total = total_result.scalar_one()

        # Order by order_index and created_at
        query = query.order_by(Documentation.order_index, Documentation.created_at.desc())

        # Apply pagination
        query = query.offset(skip).limit(limit)

        # Execute query
        result = await db.execute(query)
        documentations = result.scalars().all()

        # Calculate pagination
        page = (skip // limit) + 1 if limit > 0 else 1
        total_pages = (total + limit - 1) // limit if limit > 0 else 1

        return DocumentationList(
            items=documentations,
            total=total,
            page=page,
            page_size=limit,
            total_pages=total_pages,
        )

    @staticmethod
    async def get_documentation_by_id(
        db: AsyncSession, documentation_id: int
    ) -> Optional[Documentation]:
        """Get documentation by ID"""
        query = select(Documentation).where(Documentation.id == documentation_id)
        result = await db.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def create_documentation(
        db: AsyncSession, documentation_data: DocumentationCreate
    ) -> Documentation:
        """Create new documentation"""
        documentation = Documentation(
            platform_id=documentation_data.platform_id,
            title=documentation_data.title,
            description=documentation_data.description,
            file_url=documentation_data.file_url,
            file_type=documentation_data.file_type,
            file_name=documentation_data.file_name,
            file_size=documentation_data.file_size,
            category=documentation_data.category,
            tags=documentation_data.tags,
            uploaded_by=documentation_data.uploaded_by,
            is_active=documentation_data.is_active,
            order_index=documentation_data.order_index,
        )
        db.add(documentation)
        await db.commit()
        await db.refresh(documentation)
        return documentation

    @staticmethod
    async def update_documentation(
        db: AsyncSession, documentation_id: int, documentation_data: DocumentationUpdate
    ) -> Optional[Documentation]:
        """Update documentation"""
        documentation = await DocumentationService.get_documentation_by_id(
            db, documentation_id
        )
        if not documentation:
            return None

        # Update only provided fields
        update_data = documentation_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(documentation, field, value)

        await db.commit()
        await db.refresh(documentation)
        return documentation

    @staticmethod
    async def delete_documentation(
        db: AsyncSession, documentation_id: int, soft_delete: bool = True
    ) -> bool:
        """Delete documentation (soft or hard delete)"""
        documentation = await DocumentationService.get_documentation_by_id(
            db, documentation_id
        )
        if not documentation:
            return False

        if soft_delete:
            documentation.is_active = False
            await db.commit()
        else:
            await db.delete(documentation)
            await db.commit()

        return True

    @staticmethod
    async def increment_view_count(db: AsyncSession, documentation_id: int) -> bool:
        """Increment view count for documentation"""
        documentation = await DocumentationService.get_documentation_by_id(
            db, documentation_id
        )
        if not documentation:
            return False

        documentation.view_count += 1
        await db.commit()
        return True

    @staticmethod
    async def increment_download_count(db: AsyncSession, documentation_id: int) -> bool:
        """Increment download count for documentation"""
        documentation = await DocumentationService.get_documentation_by_id(
            db, documentation_id
        )
        if not documentation:
            return False

        documentation.download_count += 1
        await db.commit()
        return True

    @staticmethod
    async def get_documentation_stats(db: AsyncSession) -> DocumentationStats:
        """Get documentation statistics"""
        # Total documents
        total_query = select(func.count()).select_from(Documentation).where(Documentation.is_active == True)
        total_result = await db.execute(total_query)
        total_documents = total_result.scalar_one()

        # Count by file type
        videos_query = select(func.count()).select_from(Documentation).where(
            and_(Documentation.is_active == True, Documentation.file_type == "video")
        )
        videos_result = await db.execute(videos_query)
        total_videos = videos_result.scalar_one()

        images_query = select(func.count()).select_from(Documentation).where(
            and_(Documentation.is_active == True, Documentation.file_type == "image")
        )
        images_result = await db.execute(images_query)
        total_images = images_result.scalar_one()

        docs_query = select(func.count()).select_from(Documentation).where(
            and_(Documentation.is_active == True, Documentation.file_type == "document")
        )
        docs_result = await db.execute(docs_query)
        total_documents_count = docs_result.scalar_one()

        # Total views and downloads
        views_query = select(func.sum(Documentation.view_count)).select_from(Documentation).where(Documentation.is_active == True)
        views_result = await db.execute(views_query)
        total_views = views_result.scalar_one() or 0

        downloads_query = select(func.sum(Documentation.download_count)).select_from(Documentation).where(Documentation.is_active == True)
        downloads_result = await db.execute(downloads_query)
        total_downloads = downloads_result.scalar_one() or 0

        # Documents by platform
        platform_query = (
            select(Platform.name, func.count(Documentation.id))
            .join(Documentation, Documentation.platform_id == Platform.id)
            .where(Documentation.is_active == True)
            .group_by(Platform.name)
        )
        platform_result = await db.execute(platform_query)
        documents_by_platform = {row[0]: row[1] for row in platform_result.all()}

        # Documents by category
        category_query = (
            select(Documentation.category, func.count(Documentation.id))
            .where(and_(Documentation.is_active == True, Documentation.category.isnot(None)))
            .group_by(Documentation.category)
        )
        category_result = await db.execute(category_query)
        documents_by_category = {row[0]: row[1] for row in category_result.all()}

        # Recent uploads (last 10)
        recent_query = (
            select(Documentation)
            .where(Documentation.is_active == True)
            .order_by(Documentation.created_at.desc())
            .limit(10)
        )
        recent_result = await db.execute(recent_query)
        recent_uploads = recent_result.scalars().all()

        return DocumentationStats(
            total_documents=total_documents,
            total_videos=total_videos,
            total_images=total_images,
            total_documents_count=total_documents_count,
            total_views=total_views,
            total_downloads=total_downloads,
            documents_by_platform=documents_by_platform,
            documents_by_category=documents_by_category,
            recent_uploads=recent_uploads,
        )

    @staticmethod
    async def get_categories(db: AsyncSession) -> list[str]:
        """Get all unique categories"""
        query = (
            select(Documentation.category)
            .where(and_(Documentation.is_active == True, Documentation.category.isnot(None)))
            .distinct()
        )
        result = await db.execute(query)
        categories = [row[0] for row in result.all()]
        return categories

    @staticmethod
    async def get_all_tags(db: AsyncSession) -> list[str]:
        """Get all unique tags used in documentations"""
        query = select(Documentation.tags).where(Documentation.is_active == True)
        result = await db.execute(query)
        all_tags = set()
        for row in result.all():
            tags = row[0]
            if tags:
                all_tags.update(tags)
        return sorted(list(all_tags))

    @staticmethod
    async def upload_to_pocketbase(file_content: bytes, filename: str) -> str:
        """
        Upload file to PocketBase and return the file URL
        """
        pocketbase_url = settings.POCKETBASE_URL
        collection = "files"

        # Login to PocketBase as admin (timeout 300s for large files)
        async with httpx.AsyncClient(timeout=300.0) as client:
            # Authenticate - try both endpoints
            auth_response = await client.post(
                f"{pocketbase_url}/api/admins/auth-with-password",
                json={
                    "identity": settings.POCKETBASE_ADMIN_EMAIL,
                    "password": settings.POCKETBASE_ADMIN_PASSWORD,
                },
            )
            
            # If admin endpoint fails, try the collections endpoint
            if auth_response.status_code != 200:
                auth_response = await client.post(
                    f"{pocketbase_url}/api/collections/_superusers/auth-with-password",
                    json={
                        "identity": settings.POCKETBASE_ADMIN_EMAIL,
                        "password": settings.POCKETBASE_ADMIN_PASSWORD,
                    },
                )
            
            if auth_response.status_code != 200:
                raise Exception(f"Failed to authenticate with PocketBase: {auth_response.text}")

            token = auth_response.json().get("token")

            # Create a record with the file
            # PocketBase expects multipart/form-data
            files = {
                "document": (filename, file_content, "application/octet-stream")
            }
            
            # Upload file to PocketBase collection
            upload_response = await client.post(
                f"{pocketbase_url}/api/collections/{collection}/records",
                headers={"Authorization": token},  # Token without "Bearer" prefix
                files=files,
            )

            if upload_response.status_code not in [200, 201]:
                error_detail = upload_response.text
                raise Exception(f"Failed to upload file to PocketBase: {error_detail}")

            record = upload_response.json()
            
            # Check which field contains the file
            # PocketBase might use different field names: file, document, attachment, media
            file_field = None
            file_value = None
            for field_name in ['file', 'document', 'attachment', 'media']:
                if record.get(field_name):
                    file_field = field_name
                    file_value = record[field_name]
                    break
            
            if not file_field or not file_value:
                raise Exception(
                    f"No file field found in PocketBase response.\n"
                    f"Available fields: {list(record.keys())}\n"
                    f"Record: {record}\n\n"
                    f"Please check your PocketBase collection '{collection}' has a file field."
                )
            
            # Construct file URL using the found field
            file_url = f"{pocketbase_url}/api/files/{collection}/{record['id']}/{file_value}"
            return file_url
