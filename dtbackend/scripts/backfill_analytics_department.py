"""
Backfill analytics_events table with user name, sector, directorate and management information.

This script:
1. Fetches all analytics_events records that have user_id but missing user_name/sector/directorate/management
2. For each unique user_id, fetches their name and department from PocketBase
3. Extracts sector (index -4), directorate (index -3) and management (index -2) from department string
4. Updates analytics_events records with the extracted information

Usage:
    python -m scripts.backfill_analytics_department
"""

import asyncio
import httpx
from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.postgres_models import AnalyticsEvent


def extract_department_hierarchy(department: str | None) -> tuple[str | None, str | None, str | None]:
    """
    Extract sector, directorate and management from department string.
    Department format: A_B_C_D where:
    - index -4 is sector
    - index -3 is directorate
    - index -2 is management
    
    Returns:
        Tuple of (sector, directorate, management)
    """
    if not department:
        return (None, None, None)
    
    parts = department.split('_')
    if len(parts) < 2:
        return (None, None, None)
    
    sector = parts[-4] if len(parts) >= 4 else None
    directorate = parts[-3] if len(parts) >= 3 else None
    management = parts[-2] if len(parts) >= 2 else None
    
    return (sector, directorate, management)


async def get_pocketbase_user_info(username: str, client: httpx.AsyncClient, auth_token: str) -> dict | None:
    """
    Get user's information from PocketBase by username.
    
    Args:
        username: Username to look up
        client: HTTP client
        auth_token: PocketBase authentication token
        
    Returns:
        Dictionary with user info (name, department) or None if not found
    """
    try:
        user_response = await client.get(
            f"{settings.POCKETBASE_URL}/api/collections/users/records",
            params={"filter": f'username="{username}"'},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        if user_response.status_code == 200:
            users = user_response.json().get("items", [])
            if users:
                user = users[0]
                return {
                    "name": user.get("name"),
                    "department": user.get("department")
                }
        
        return None
    except Exception as e:
        print(f"Error fetching PocketBase user {username}: {e}")
        return None


async def authenticate_pocketbase(client: httpx.AsyncClient) -> str | None:
    """
    Authenticate with PocketBase as admin.
    
    Returns:
        Authentication token or None if authentication fails
    """
    if not settings.POCKETBASE_ADMIN_EMAIL or not settings.POCKETBASE_ADMIN_PASSWORD:
        print("Error: PocketBase admin credentials not configured")
        return None
    
    try:
        auth_response = await client.post(
            f"{settings.POCKETBASE_URL}/api/collections/_superusers/auth-with-password",
            json={
                "identity": settings.POCKETBASE_ADMIN_EMAIL,
                "password": settings.POCKETBASE_ADMIN_PASSWORD
            }
        )
        
        if auth_response.status_code != 200:
            print(f"Error: PocketBase authentication failed with status {auth_response.status_code}")
            return None
        
        auth_token = auth_response.json().get("token", "")
        if not auth_token:
            print("Error: No token received from PocketBase")
            return None
        
        return auth_token
    except Exception as e:
        print(f"Error authenticating with PocketBase: {e}")
        return None


async def backfill_analytics_department():
    """
    Main function to backfill analytics_events with user name, sector, directorate and management.
    """
    print("Starting analytics_events backfill process...")
    
    async with httpx.AsyncClient(timeout=30.0) as http_client:
        # Authenticate with PocketBase
        print("Authenticating with PocketBase...")
        auth_token = await authenticate_pocketbase(http_client)
        if not auth_token:
            print("Failed to authenticate with PocketBase. Exiting.")
            return
        
        print("Successfully authenticated with PocketBase")
        
        async with AsyncSessionLocal() as db:
            # Get all unique user_ids that need updating
            print("\nFetching records that need updating...")
            query = text("""
                SELECT DISTINCT user_id
                FROM analytics_events
                WHERE user_id IS NOT NULL
                  AND user_id != ''
                  AND (user_name IS NULL OR sector IS NULL OR directorate IS NULL OR management IS NULL)
            """)
            
            result = await db.execute(query)
            user_ids = [row[0] for row in result.fetchall()]
            
            if not user_ids:
                print("No records need updating. All done!")
                return
            
            print(f"Found {len(user_ids)} unique users to process")
            
            # Build a mapping of user_id -> (name, sector, directorate, management)
            user_info_map = {}
            
            print("\nFetching user information from PocketBase...")
            for i, user_id in enumerate(user_ids, 1):
                print(f"Processing user {i}/{len(user_ids)}: {user_id}")
                
                user_info = await get_pocketbase_user_info(user_id, http_client, auth_token)
                if user_info:
                    name = user_info.get("name")
                    department = user_info.get("department")
                    sector, directorate, management = extract_department_hierarchy(department)
                    user_info_map[user_id] = {
                        'name': name,
                        'department': department,
                        'sector': sector,
                        'directorate': directorate,
                        'management': management
                    }
                    print(f"  Name: {name}")
                    print(f"  Department: {department}")
                    print(f"  Sector: {sector}, Directorate: {directorate}, Management: {management}")
                else:
                    print(f"  No information found for user: {user_id}")
                
                # Small delay to avoid overwhelming PocketBase
                await asyncio.sleep(0.1)
            
            print(f"\nSuccessfully fetched info for {len(user_info_map)} users")
            
            # Update analytics_events records
            print("\nUpdating analytics_events records...")
            total_updated = 0
            
            for user_id, user_info in user_info_map.items():
                if user_info['name'] or user_info['sector'] or user_info['directorate'] or user_info['management']:
                    update_query = text("""
                        UPDATE analytics_events
                        SET user_name = :user_name,
                            sector = :sector,
                            directorate = :directorate,
                            management = :management
                        WHERE user_id = :user_id
                          AND (user_name IS NULL OR sector IS NULL OR directorate IS NULL OR management IS NULL)
                    """)
                    
                    result = await db.execute(
                        update_query,
                        {
                            'user_name': user_info['name'],
                            'sector': user_info['sector'],
                            'directorate': user_info['directorate'],
                            'management': user_info['management'],
                            'user_id': user_id
                        }
                    )
                    
                    updated_count = result.rowcount
                    total_updated += updated_count
                    print(f"Updated {updated_count} records for user: {user_id}")
            
            await db.commit()
            
            print(f"\n{'='*60}")
            print(f"Backfill completed successfully!")
            print(f"Total records updated: {total_updated}")
            print(f"{'='*60}")


if __name__ == "__main__":
    asyncio.run(backfill_analytics_department())
