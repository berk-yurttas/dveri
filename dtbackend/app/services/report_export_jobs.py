"""In-memory Excel export jobs with progress for large report downloads."""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from threading import Lock

JOB_TTL_SECONDS = 60 * 60


@dataclass
class ExcelExportJob:
    id: str
    status: str = "queued"
    percent: int = 1
    label: str = "Hazırlanıyor..."
    rows_written: int = 0
    filename: str | None = None
    file_path: str | None = None
    error: str | None = None
    created_at: float = field(default_factory=time.time)


_lock = Lock()
_jobs: dict[str, ExcelExportJob] = {}


def create_job() -> ExcelExportJob:
    _cleanup_expired()
    job = ExcelExportJob(id=str(uuid.uuid4()))
    with _lock:
        _jobs[job.id] = job
    return job


def get_job(job_id: str) -> ExcelExportJob | None:
    with _lock:
        return _jobs.get(job_id)


def update_job(
    job_id: str,
    *,
    status: str | None = None,
    percent: int | None = None,
    label: str | None = None,
    rows_written: int | None = None,
    filename: str | None = None,
    file_path: str | None = None,
    error: str | None = None,
) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        if status is not None:
            job.status = status
        if percent is not None:
            job.percent = max(job.percent, min(100, percent)) if status != "error" else percent
        if label is not None:
            job.label = label
        if rows_written is not None:
            job.rows_written = rows_written
        if filename is not None:
            job.filename = filename
        if file_path is not None:
            job.file_path = file_path
        if error is not None:
            job.error = error


def _cleanup_expired() -> None:
    now = time.time()
    with _lock:
        expired = [job_id for job_id, job in _jobs.items() if now - job.created_at > JOB_TTL_SECONDS]
        for job_id in expired:
            job = _jobs.pop(job_id, None)
            if job and job.file_path:
                try:
                    Path(job.file_path).unlink(missing_ok=True)
                except OSError:
                    pass
