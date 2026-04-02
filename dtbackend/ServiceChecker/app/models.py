from datetime import datetime, timezone

from app import db


class ApiEndpoint(db.Model):
    __tablename__ = "api_endpoints"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    url = db.Column(db.String(2048), nullable=False)
    check_url = db.Column(db.String(2048), nullable=True)
    http_method = db.Column(db.String(16), nullable=False, default="GET")
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    is_up = db.Column(db.Boolean, nullable=True)
    last_check_at = db.Column(db.DateTime(timezone=True), nullable=True)
    last_response_time_ms = db.Column(db.Float, nullable=True)
    avg_response_time_ms = db.Column(db.Float, nullable=True)
    total_checks = db.Column(db.Integer, nullable=False, default=0)
    successful_checks = db.Column(db.Integer, nullable=False, default=0)

    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def success_rate_percent(self):
        if self.total_checks == 0:
            return None
        return round(100.0 * self.successful_checks / self.total_checks, 2)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "url": self.url,
            "check_url": self.check_url,
            "http_method": self.http_method,
            "is_active": self.is_active,
            "is_up": self.is_up,
            "last_check_at": self.last_check_at.isoformat()
            if self.last_check_at
            else None,
            "last_response_time_ms": self.last_response_time_ms,
            "avg_response_time_ms": round(self.avg_response_time_ms, 2)
            if self.avg_response_time_ms is not None
            else None,
            "success_rate_percent": self.success_rate_percent(),
            "total_checks": self.total_checks,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
