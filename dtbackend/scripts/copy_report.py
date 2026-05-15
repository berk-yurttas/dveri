"""
Copy a report and all its related queries and filters.

This script:
1. Takes a report ID as input
2. Prompts for a new report name
3. Copies the report with a new name
4. Copies all related report_queries
5. Copies all related report_query_filters for each query
6. Maintains the relationships between the copied entities

Usage:
    python -m scripts.copy_report --id <report_id> --name "New Report Name"
    
    Or interactively:
    python -m scripts.copy_report
"""

import argparse
import asyncio
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.postgres_models import Report, ReportQuery, ReportQueryFilter


async def copy_report(report_id: int, new_name: str, db: AsyncSession) -> Report | None:
    """
    Copy a report and all its related queries and filters.
    
    Args:
        report_id: ID of the report to copy
        new_name: Name for the new report
        db: Database session
        
    Returns:
        The newly created report or None if source report not found
    """
    # Fetch the original report with all its queries and filters
    query = select(Report).where(Report.id == report_id)
    result = await db.execute(query)
    original_report = result.scalar_one_or_none()
    
    if not original_report:
        print(f"❌ Error: Report with ID {report_id} not found")
        return None
    
    print(f"\n📋 Found report: {original_report.name}")
    print(f"   Description: {original_report.description or 'N/A'}")
    print(f"   Owner ID: {original_report.owner_id}")
    print(f"   Platform ID: {original_report.platform_id}")
    
    # Create a new report by copying the original
    new_report = Report(
        platform_id=original_report.platform_id,
        name=new_name,
        description=original_report.description,
        owner_id=original_report.owner_id,
        is_public=original_report.is_public,
        tags=original_report.tags,
        global_filters=original_report.global_filters,
        layout_config=original_report.layout_config,
        color=original_report.color,
        allowed_departments=original_report.allowed_departments,
        allowed_users=original_report.allowed_users,
        is_direct_link=original_report.is_direct_link,
        direct_link=original_report.direct_link,
        db_config=original_report.db_config,
        created_at=datetime.now(),
        updated_at=datetime.now(),
        deleted_at=None
    )
    
    db.add(new_report)
    await db.flush()  # Flush to get the new report ID
    
    print(f"\n✅ Created new report: {new_report.name} (ID: {new_report.id})")
    
    # Fetch and copy all queries for this report
    queries_query = select(ReportQuery).where(ReportQuery.report_id == report_id).order_by(ReportQuery.order_index)
    queries_result = await db.execute(queries_query)
    original_queries = queries_result.scalars().all()
    
    if not original_queries:
        print("   ⚠️  No queries found for this report")
    else:
        print(f"\n📊 Copying {len(original_queries)} queries...")
    
    # Map old query ID to new query ID for filter relationships
    query_id_map = {}
    
    for original_query in original_queries:
        # Create new query
        new_query = ReportQuery(
            report_id=new_report.id,
            name=original_query.name,
            sql=original_query.sql,
            visualization_config=original_query.visualization_config,
            order_index=original_query.order_index,
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        db.add(new_query)
        await db.flush()  # Flush to get the new query ID
        
        query_id_map[original_query.id] = new_query.id
        
        print(f"   ✅ Copied query: {new_query.name} (ID: {new_query.id})")
        
        # Fetch and copy all filters for this query
        filters_query = select(ReportQueryFilter).where(ReportQueryFilter.query_id == original_query.id)
        filters_result = await db.execute(filters_query)
        original_filters = filters_result.scalars().all()
        
        if original_filters:
            print(f"      🔍 Copying {len(original_filters)} filters...")
            
            for original_filter in original_filters:
                new_filter = ReportQueryFilter(
                    query_id=new_query.id,
                    field_name=original_filter.field_name,
                    display_name=original_filter.display_name,
                    filter_type=original_filter.filter_type,
                    dropdown_query=original_filter.dropdown_query,
                    required=original_filter.required,
                    sql_expression=original_filter.sql_expression,
                    depends_on=original_filter.depends_on,
                    created_at=datetime.now(),
                    updated_at=datetime.now()
                )
                
                db.add(new_filter)
                print(f"         ✅ Copied filter: {new_filter.display_name} ({new_filter.filter_type})")
    
    # Commit all changes
    await db.commit()
    
    print(f"\n{'='*60}")
    print(f"🎉 Successfully copied report!")
    print(f"   Original Report ID: {report_id}")
    print(f"   New Report ID: {new_report.id}")
    print(f"   New Report Name: {new_report.name}")
    print(f"   Queries Copied: {len(original_queries)}")
    print(f"{'='*60}\n")
    
    return new_report


async def main():
    """Main function to handle command-line arguments and execute the copy."""
    parser = argparse.ArgumentParser(description="Copy a report with all its queries and filters")
    parser.add_argument("--id", type=int, help="ID of the report to copy")
    parser.add_argument("--name", type=str, help="Name for the new report")
    
    args = parser.parse_args()
    
    # If arguments not provided, prompt interactively
    report_id = args.id
    new_name = args.name
    
    if report_id is None:
        try:
            report_id = int(input("Enter the Report ID to copy: "))
        except ValueError:
            print("❌ Error: Invalid report ID. Please enter a number.")
            return
    
    if new_name is None:
        new_name = input("Enter the name for the new report: ").strip()
        if not new_name:
            print("❌ Error: Report name cannot be empty.")
            return
    
    print(f"\n🚀 Starting report copy process...")
    print(f"   Source Report ID: {report_id}")
    print(f"   New Report Name: {new_name}")
    
    async with AsyncSessionLocal() as db:
        try:
            await copy_report(report_id, new_name, db)
        except Exception as e:
            print(f"\n❌ Error occurred during copy: {e}")
            await db.rollback()
            raise


if __name__ == "__main__":
    asyncio.run(main())
