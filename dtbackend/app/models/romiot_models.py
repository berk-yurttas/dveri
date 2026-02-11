from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import PostgreSQLBase


class Station(PostgreSQLBase):
    __tablename__ = "stations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    company = Column(String(255), nullable=False)

    # Note: users relationship points to User model in primary database (postgres_models)
    # Since foreign keys can't span databases, this is a conceptual relationship only.
    # The actual user_id is stored in WorkOrder without a database foreign key constraint.
    work_orders = relationship("WorkOrder", back_populates="station", cascade="all, delete-orphan")


class WorkOrder(PostgreSQLBase):
    __tablename__ = "work_orders"
    __table_args__ = (
        UniqueConstraint('station_id', 'work_order_group_id', 'package_index', name='uq_work_order_package'),
    )

    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(Integer, ForeignKey("stations.id"), nullable=False)
    # user_id references users table in the PRIMARY database (not RomIOT database)
    # Since foreign keys can't span databases, we store it as a plain integer
    # without a foreign key constraint. Referential integrity must be handled in application logic.
    user_id = Column(Integer, nullable=False, index=True)

    # Group ID to link all packages of the same work order together
    work_order_group_id = Column(String(50), nullable=False, index=True)

    # Work order fields (from form)
    main_customer = Column(String(255), nullable=False)
    sector = Column(String(255), nullable=False)
    company_from = Column(String(255), nullable=False)
    aselsan_order_number = Column(String(255), nullable=False)
    order_item_number = Column(String(255), nullable=False)

    # Quantity fields
    quantity = Column(Integer, nullable=False)          # This package's piece count
    total_quantity = Column(Integer, nullable=False)     # Total pieces across all packages

    # Package tracking
    package_index = Column(Integer, nullable=False)      # 1-based package index
    total_packages = Column(Integer, nullable=False)     # Total number of packages

    # Target date
    target_date = Column(Date, nullable=True)

    # Timestamps
    entrance_date = Column(DateTime(timezone=True), server_default=func.now())
    exit_date = Column(DateTime(timezone=True), nullable=True)

    # relationships
    station = relationship("Station", back_populates="work_orders")


class QRCodeData(PostgreSQLBase):
    """
    Stores QR code data with a short unique code for compression.
    This allows QR codes to contain just the short code instead of full JSON.
    """
    __tablename__ = "qr_code_data"

    id = Column(Integer, primary_key=True, index=True)
    # Short unique code (10-12 characters) to be embedded in QR
    code = Column(String(20), unique=True, nullable=False, index=True)
    # Full JSON data
    data = Column(Text, nullable=False)
    # Company for filtering
    company = Column(String(255), nullable=False, index=True)
    # Creation timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # Expiry timestamp (optional - for cleanup of old QR codes)
    expires_at = Column(DateTime(timezone=True), nullable=True)
