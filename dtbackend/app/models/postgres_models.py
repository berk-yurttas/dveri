from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text, ARRAY
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship, backref
from sqlalchemy.sql import func
from app.core.database import PostgreSQLBase


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


class Dashboard(PostgreSQLBase):
    __tablename__ = "dashboards"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_public = Column(Boolean, default=False)
    layout_config = Column(JSONB)
    widgets = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # one owner
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
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_public = Column(Boolean, default=False)
    tags = Column(ARRAY(String), default=[])
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # relationships
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
