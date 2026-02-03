from sqlalchemy import (
    ARRAY,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import PostgreSQLBase


class Platform(PostgreSQLBase):
    """Platform/Application model for multi-tenancy support"""
    __tablename__ = "platforms"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, nullable=False, index=True)  # 'deriniz', 'app2', 'app3', 'app4'
    name = Column(String(255), nullable=False)  # 'DerinIZ', 'App 2', etc.
    display_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    # Database configuration - supports multiple database types
    db_type = Column(String(50), nullable=False, default='clickhouse')  # 'clickhouse', 'mssql', 'postgresql'
    db_config = Column(JSONB, nullable=True)  # Flexible database configuration
    # Example db_config structure:
    # {
    #   "host": "localhost",
    #   "port": 9000,
    #   "database": "dt_report",
    #   "user": "default",
    #   "password": "ClickHouse@2024",
    #   "connection_string": "clickhouse://user:pass@host:port/db"  # Alternative to individual fields
    # }

    # Branding/theming configuration
    logo_url = Column(String(255), nullable=True)
    theme_config = Column(JSONB, nullable=True)  # { "primaryColor": "#3B82F6", "secondaryColor": "#8B5CF6", "features": [{ "title": "...", "subfeatures": [...] }], ... }

    # Status
    is_active = Column(Boolean, default=True, nullable=False)
    allowed_departments = Column(ARRAY(String), default=[])
    allowed_users = Column(ARRAY(String), default=[])
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    dashboards = relationship("Dashboard", back_populates="platform", cascade="all, delete-orphan")
    reports = relationship("Report", back_populates="platform", cascade="all, delete-orphan")
    user_platforms = relationship("UserPlatform", back_populates="platform", cascade="all, delete-orphan")


class User(PostgreSQLBase):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    name = Column(String(255), nullable=True)
    # workshop_id references workshops table in the ROMIOT database (not primary database)
    # Since foreign keys can't span databases, we store it as a plain integer
    # without a foreign key constraint. Referential integrity must be handled in application logic.
    workshop_id = Column(Integer, nullable=True, index=True)
    # Login tracking fields
    login_count = Column(Integer, default=0, nullable=False)
    last_login_at = Column(DateTime(timezone=True), nullable=True)

    # many-to-many through DashboardUser
    dashboards = relationship(
        "DashboardUser",
        back_populates="user",
        cascade="all, delete-orphan"
    )

    # one-to-many with reports
    owned_reports = relationship("Report", back_populates="owner", cascade="all, delete-orphan")

    # many-to-many with platforms through UserPlatform
    user_platforms = relationship("UserPlatform", back_populates="user", cascade="all, delete-orphan")


class AnalyticsEvent(PostgreSQLBase):
    __tablename__ = "analytics_events"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    event_type = Column(String(50), nullable=False)
    path = Column(Text, nullable=False)
    session_id = Column(String(255), nullable=False)
    user_id = Column(String(255), nullable=True)
    ip = Column(String(50), nullable=True)
    user_agent = Column(Text, nullable=True)
    duration = Column(Integer, nullable=False, default=0)
    meta = Column(JSONB, nullable=True)


class Dashboard(PostgreSQLBase):
    __tablename__ = "dashboards"

    id = Column(Integer, primary_key=True, index=True)
    platform_id = Column(Integer, ForeignKey("platforms.id"), nullable=True, index=True)  # Platform/App association
    title = Column(String(200), nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_public = Column(Boolean, default=False)
    layout_config = Column(JSONB)
    widgets = Column(JSONB)
    tags = Column(ARRAY(String), default=[])
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    platform = relationship("Platform", back_populates="dashboards")  # Platform relationship
    owner = relationship("User", backref="owned_dashboards")

    # many-to-many through DashboardUser
    users = relationship(
        "DashboardUser",
        back_populates="dashboard",
        cascade="all, delete-orphan"
    )

    # Property to handle is_favorite field (set dynamically)
    is_favorite = None


class DashboardUser(PostgreSQLBase):
    __tablename__ = "dashboard_users"

    id = Column(Integer, primary_key=True, index=True)
    dashboard_id = Column(Integer, ForeignKey("dashboards.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_favorite = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # relationships back
    dashboard = relationship("Dashboard", back_populates="users")
    user = relationship("User", back_populates="dashboards")


class Report(PostgreSQLBase):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    platform_id = Column(Integer, ForeignKey("platforms.id"), nullable=True, index=True)  # Platform/App association
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_public = Column(Boolean, default=False)
    tags = Column(ARRAY(String), default=[])
    global_filters = Column(JSONB, default=[])  # Global filters that apply to all queries
    layout_config = Column(JSONB, default=[])  # Grid layout configuration for queries
    color = Column(String(50), default="#3B82F6")  # Report card border/theme color
    allowed_departments = Column(ARRAY(String), default=[])
    allowed_users = Column(ARRAY(String), default=[])
    is_direct_link = Column(Boolean, default=False)  # If true, report uses direct link instead of queries
    direct_link = Column(Text, nullable=True)  # Direct link URL to external report page
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    platform = relationship("Platform", back_populates="reports")  # Platform relationship
    owner = relationship("User", back_populates="owned_reports")
    queries = relationship("ReportQuery", back_populates="report", cascade="all, delete-orphan", order_by="ReportQuery.order_index")
    users = relationship("ReportUser", back_populates="report", cascade="all, delete-orphan")

    # Property to handle is_favorite field (set dynamically)
    is_favorite = None


class ReportQuery(PostgreSQLBase):
    __tablename__ = "report_queries"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=False)
    name = Column(String(255), nullable=False)
    sql = Column(Text, nullable=False)
    visualization_config = Column(JSONB, nullable=False)
    order_index = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # relationships
    report = relationship("Report", back_populates="queries")
    filters = relationship("ReportQueryFilter", back_populates="query", cascade="all, delete-orphan")

    # Property for Pydantic serialization
    @property
    def visualization(self):
        return self.visualization_config


class ReportQueryFilter(PostgreSQLBase):
    __tablename__ = "report_query_filters"

    id = Column(Integer, primary_key=True, index=True)
    query_id = Column(Integer, ForeignKey("report_queries.id"), nullable=False)
    field_name = Column(String(255), nullable=False)
    display_name = Column(String(255), nullable=False)
    filter_type = Column(String(50), nullable=False)  # date, dropdown, multiselect, number, text
    dropdown_query = Column(Text)  # SQL query for dropdown/multiselect options
    required = Column(Boolean, default=False)
    sql_expression = Column(Text)  # Custom SQL expression to use instead of field_name (e.g., DATE(field_name), LOWER(field_name))
    depends_on = Column(String(255))  # Field name of the filter this filter depends on (for cascading dropdowns)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # relationships
    query = relationship("ReportQuery", back_populates="filters")

    # Property for Pydantic serialization
    @property
    def type(self):
        return self.filter_type


class ReportUser(PostgreSQLBase):
    """Junction table for Report-User many-to-many relationship with favorites"""
    __tablename__ = "report_users"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_favorite = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # relationships
    report = relationship("Report", back_populates="users")
    user = relationship("User", backref="report_users")


class UserPlatform(PostgreSQLBase):
    """Junction table for User-Platform many-to-many relationship with roles"""
    __tablename__ = "user_platforms"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    platform_id = Column(Integer, ForeignKey("platforms.id"), nullable=False, index=True)
    role = Column(String(50), default="viewer", nullable=False)  # admin, editor, viewer
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="user_platforms")
    platform = relationship("Platform", back_populates="user_platforms")


class Announcement(PostgreSQLBase):
    """Announcement model for displaying news and updates"""
    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(Text, nullable=False)
    month_title = Column(Text, nullable=True)  # e.g., "Kasım", "Aralık"
    content_summary = Column(Text, nullable=True)
    content_detail = Column(Text, nullable=True)
    content_image = Column(Text, nullable=True)  # Store as base64 string or URL
    creation_date = Column(DateTime(timezone=True), server_default=func.now())
    expire_date = Column(DateTime(timezone=True), nullable=True)
    platform_id = Column(Integer, ForeignKey("platforms.id", ondelete="SET NULL"), nullable=True, index=True)

    # Relationships
    platform = relationship("Platform", backref="announcements")


class Config(PostgreSQLBase):
    """Configuration model for storing application settings"""
    __tablename__ = "configs"

    id = Column(Integer, primary_key=True, index=True)
    platform_id = Column(Integer, ForeignKey("platforms.id", ondelete="CASCADE"), nullable=True, index=True)
    config_key = Column(String(255), nullable=False, index=True)  # e.g., "color_groups", "report_settings"
    config_value = Column(JSONB, nullable=False)  # Store settings as JSON
    # Example config_value for color_groups:
    # {
    #   "#FF6B6B": {"name": "Şirket", "description": "Company reports"},
    #   "#3B82F6": {"name": "Kişisel", "description": "Personal reports"},
    #   "#10B981": {"name": "Finansal", "description": "Financial reports"}
    # }
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    platform = relationship("Platform", backref="configs")
