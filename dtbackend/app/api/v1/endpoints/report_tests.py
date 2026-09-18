from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import check_authenticated
from app.core.database import get_postgres_db
from app.schemas.report_tests import (
    ReportTestRunDetail,
    ReportTestRunList,
    ReportTestRunOut,
    ReportTestStartRequest,
    ReportTestSummary,
)
from app.schemas.user import User
from app.services import report_test_service

router = APIRouter()


def _require_admin(current_user: User) -> None:
    roles = current_user.role or []
    allowed = {"miras:admin", "odak:admin"}
    if not any((role or "").lower() in allowed for role in roles):
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")


@router.get("/summary", response_model=ReportTestSummary)
async def report_test_summary(
    current_user: User = Depends(check_authenticated),
    db: AsyncSession = Depends(get_postgres_db),
):
    _require_admin(current_user)
    payload = await report_test_service.get_summary(db)
    return ReportTestSummary.model_validate(payload)


@router.get("/runs", response_model=ReportTestRunList)
async def list_report_test_runs(
    platform_id: int | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(check_authenticated),
    db: AsyncSession = Depends(get_postgres_db),
):
    _require_admin(current_user)
    items, total = await report_test_service.list_runs(
        db, platform_id=platform_id, limit=limit, offset=offset
    )
    return ReportTestRunList(items=items, total=total)


@router.post("/runs", response_model=ReportTestRunOut)
async def start_report_test_run(
    request: Request,
    payload: ReportTestStartRequest | None = None,
    current_user: User = Depends(check_authenticated),
):
    _require_admin(current_user)
    body = payload or ReportTestStartRequest()
    try:
        run = await report_test_service.start_run(
            triggered_by=current_user.username,
            trigger="manual",
            platform_id=body.platform_id,
            report_id=body.report_id,
            auth_cookies=dict(request.cookies),
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return run


@router.get("/runs/{run_id}", response_model=ReportTestRunDetail)
async def get_report_test_run(
    run_id: int,
    include_results: bool = Query(True),
    current_user: User = Depends(check_authenticated),
    db: AsyncSession = Depends(get_postgres_db),
):
    _require_admin(current_user)
    run = await report_test_service.get_run(db, run_id, include_results=include_results)
    if not run:
        raise HTTPException(status_code=404, detail="Test run not found")
    if not include_results:
        base = ReportTestRunOut.model_validate(run)
        return ReportTestRunDetail(**base.model_dump(), results=[])
    return run


@router.post("/runs/{run_id}/cancel", response_model=ReportTestRunOut)
async def cancel_report_test_run(
    run_id: int,
    current_user: User = Depends(check_authenticated),
    db: AsyncSession = Depends(get_postgres_db),
):
    _require_admin(current_user)
    cancelled = await report_test_service.request_cancel(run_id)
    if not cancelled:
        raise HTTPException(status_code=404, detail="No running test found")
    run = await report_test_service.get_run(db, run_id, include_results=False)
    if not run:
        raise HTTPException(status_code=404, detail="Test run not found")
    return run
