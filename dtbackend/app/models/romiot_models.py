from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import PostgreSQLBase


class Station(PostgreSQLBase):
    __tablename__ = "stations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    company = Column(String(255), nullable=False)
    is_exit_station = Column(Boolean, nullable=False, server_default="false")

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
    part_number = Column(String(255), nullable=False)  # Parça Numarası

    # Quantity fields
    quantity = Column(Integer, nullable=False)          # This package's piece count
    total_quantity = Column(Integer, nullable=False)     # Total pieces across all packages

    # Package tracking
    package_index = Column(Integer, nullable=False)      # 1-based package index
    total_packages = Column(Integer, nullable=False)     # Total number of packages

    # Target date
    target_date = Column(Date, nullable=True)

    # Priority (assigned by satinalma role, 0-5)
    priority = Column(Integer, nullable=False, server_default="0")
    # User ID of the satinalma user who assigned priority (references primary DB)
    prioritized_by = Column(Integer, nullable=True)
    # Whether work order has been delivered (exited from exit station)
    delivered = Column(Boolean, nullable=False, server_default="false")

    # Timestamps
    entrance_date = Column(DateTime(timezone=True), server_default=func.now())
    exit_date = Column(DateTime(timezone=True), nullable=True)

    # relationships
    station = relationship("Station", back_populates="work_orders")


class PriorityToken(PostgreSQLBase):
    """Tracks token usage for satinalma users."""
    __tablename__ = "priority_tokens"

    id = Column(Integer, primary_key=True, index=True)
    # User ID from primary database (satinalma user)
    user_id = Column(Integer, nullable=False, index=True)
    company = Column(String(255), nullable=False, index=True)
    # Total tokens allocated
    total_tokens = Column(Integer, nullable=False)
    # Tokens currently spent (assigned to work orders)
    used_tokens = Column(Integer, nullable=False, server_default="0")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


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
