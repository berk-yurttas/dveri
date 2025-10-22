from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text, ARRAY
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship, backref
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
    theme_config = Column(JSONB, nullable=True)  # { "primaryColor": "#3B82F6", "secondaryColor": "#8B5CF6", ... }
    
    # Status
    is_active = Column(Boolean, default=True, nullable=False)
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
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    platform = relationship("Platform", back_populates="reports")  # Platform relationship
    owner = relationship("User", back_populates="owned_reports")
    queries = relationship("ReportQuery", back_populates="report", cascade="all, delete-orphan", order_by="ReportQuery.order_index")


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
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # relationships
    query = relationship("ReportQuery", back_populates="filters")
    
    # Property for Pydantic serialization
    @property
    def type(self):
        return self.filter_type


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
