from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import PostgreSQLBase


class Station(PostgreSQLBase):
    __tablename__ = "stations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    company = Column(String(255), nullable=False)
    is_entry_station = Column(Boolean, nullable=False, server_default="false")
    is_exit_station = Column(Boolean, nullable=False, server_default="false")
    station_order_code = Column(Integer, nullable=True)

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
    # FK form of company_from (Q13). Nullable for legacy rows / unmatched names;
    # the string column above is kept as a back-compat mirror, dropped in a later pass.
    company_from_id = Column(Integer, ForeignKey("companies.id", ondelete="RESTRICT"), nullable=True)
    teklif_number = Column(String(20), nullable=False)  # Teklif Numarası (MKS-XXXXXX)
    aselsan_order_number = Column(String(255), nullable=True)   # legacy fallback only; F3 reads from work_order_pairs
    order_item_number = Column(String(255), nullable=True)      # legacy fallback only; F3 reads from work_order_pairs
    part_number = Column(String(255), nullable=False)  # Parça Numarası

    # Quantity fields
    quantity = Column(Integer, nullable=False)          # This package's piece count (cap)
    total_quantity = Column(Integer, nullable=False)     # Total pieces across all packages
    # Partial-quantity tracking (Kısmi Adet): 0 <= exited_quantity <= entered_quantity <= quantity
    entered_quantity = Column(Integer, nullable=False, server_default="0")  # pieces entered at this station
    exited_quantity = Column(Integer, nullable=False, server_default="0")   # pieces exited at this station

    # Package tracking
    package_index = Column(Integer, nullable=False)      # 1-based package index
    total_packages = Column(Integer, nullable=False)     # Total number of packages

    # Target date
    target_date = Column(Date, nullable=True)

    # Mekasan integration fields
    revision_number = Column(String(255), nullable=True)
    qr_code = Column(String(20), nullable=True)         # Short code that was scanned
    qr_created_at = Column(DateTime(timezone=True), nullable=True)  # When the QR was created

    # Priority (assigned by satinalma role, 0-5)
    priority = Column(Integer, nullable=False, server_default="0")
    # User ID of the satinalma user who assigned priority (references primary DB)
    prioritized_by = Column(Integer, nullable=True)
    # Whether work order has been delivered (exited from exit station)
    delivered = Column(Boolean, nullable=False, server_default="false")
    # Whether operator overrode a route warning when this row was committed
    route_violation = Column(Boolean, nullable=False, server_default="false")
    # Whether the row's CURRENT state has been delivered to the Toy/Mekasan API.
    # Reset to false whenever the state changes (row created, exit_date filled);
    # set true when a push of the current state succeeds. Drives piggyback retry.
    sent = Column(Boolean, nullable=False, server_default="false")

    # Timestamps
    entrance_date = Column(DateTime(timezone=True), server_default=func.now())
    exit_date = Column(DateTime(timezone=True), nullable=True)

    # relationships
    station = relationship("Station", back_populates="work_orders")


class WorkOrderScan(PostgreSQLBase):
    """Append-only audit log of each partial entrance/exit scan."""
    __tablename__ = "work_order_scans"

    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(Integer, ForeignKey("stations.id"), nullable=False)
    work_order_group_id = Column(String(50), nullable=False, index=True)
    package_index = Column(Integer, nullable=False)
    direction = Column(String(3), nullable=False)  # 'in' (entrance) | 'out' (exit)
    quantity = Column(Integer, nullable=False)     # pieces in this single scan
    user_id = Column(Integer, nullable=False, index=True)
    qr_code = Column(String(20), nullable=True)
    scanned_at = Column(DateTime(timezone=True), server_default=func.now())


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


class CompanyIntegration(PostgreSQLBase):
    """
    Stores per-company external API credentials for integrations (e.g. Mekasan).
    Auto-created (with null credentials) when a station is first created for a company.
    """
    __tablename__ = "company_integrations"

    id = Column(Integer, primary_key=True, index=True)
    company = Column(String(255), nullable=False, unique=True, index=True)
    api_url = Column(String(1024), nullable=True)
    api_key = Column(String(512), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class WorkOrderLinkDirectory(PostgreSQLBase):
    """
    Stores a per-company root directory used to generate local work-order links.
    """
    __tablename__ = "work_order_link_directories"

    id = Column(Integer, primary_key=True, index=True)
    company = Column(String(255), nullable=False, unique=True, index=True)
    root_directory = Column(String(1024), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class UrunumNeredeMesSource(PostgreSQLBase):
    """Per-Hedef-Firma source mapping for the 'Ürünüm Nerede?' tracker.

    Maps a Hedef Firma (target/coating company, matching
    `company_integrations.company`) to its external MES table in AFLOW and an
    optional single-column equality filter. Read by mes_tracking_service.
    """
    __tablename__ = "urunum_nerede_mes_sources"

    id = Column(Integer, primary_key=True, index=True)
    company = Column(String(255), nullable=False, unique=True, index=True)
    table_name = Column(String(255), nullable=False)
    filter_column = Column(String(128), nullable=True)
    filter_value = Column(String(512), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())



class WorkOrderPair(PostgreSQLBase):
    """One (Sipariş No, Kalem No) pair belonging to a work order group.

    Every package of a group shares the same pair list. F3 introduces
    multi-pair work orders; legacy single-pair WorkOrder rows have one
    matching WorkOrderPair row with idx=0 created by the M1 backfill.
    """
    __tablename__ = "work_order_pairs"
    __table_args__ = (
        UniqueConstraint("work_order_group_id", "idx", name="uq_work_order_pair"),
    )

    id = Column(Integer, primary_key=True, index=True)
    work_order_group_id = Column(String(50), nullable=False, index=True)
    idx = Column(Integer, nullable=False)
    aselsan_order_number = Column(String(255), nullable=False)
    order_item_number = Column(String(255), nullable=False)


class WorkOrderRoute(PostgreSQLBase):
    """An ordered station for a work order group's planned route.

    Position 0 is the entry station (operator's station at first scan).
    Subsequent positions are 1, 2, 3, ... in the order the operator
    expects the QR to be scanned. F6 references this table on every
    subsequent scan to detect off-route and out-of-order events.
    """
    __tablename__ = "work_order_routes"
    __table_args__ = (
        UniqueConstraint("work_order_group_id", "position", name="uq_route_position"),
    )

    id = Column(Integer, primary_key=True, index=True)
    work_order_group_id = Column(String(50), nullable=False, index=True)
    position = Column(Integer, nullable=False)
    # FK→stations.id ON DELETE RESTRICT, blocks station delete while a route references it
    station_id = Column(Integer, ForeignKey("stations.id", ondelete="RESTRICT"), nullable=False)
    # user_id from PRIMARY database (not romiot), see WorkOrder.user_id for cross-DB rationale
    created_by_user_id = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Company(PostgreSQLBase):
    """Authoritative company registry for the atolye subsystem (replaces the
    PocketBase department as the source of a user's company). `name` is the
    canonical company string used by stations/qr/work_orders; `code` is sent to
    Mekasan as SubcontractorID."""
    __tablename__ = "companies"
    __table_args__ = (
        UniqueConstraint("name", name="uq_companies_name"),
        UniqueConstraint("code", name="uq_companies_code"),
    )

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    code = Column(String(64), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class UserCompany(PostgreSQLBase):
    """1:1 pairing of a PocketBase user to a company. `pb_user_id` stores the
    PocketBase user id (string); no cross-DB FK is possible (same pattern as
    WorkOrder.user_id). UNIQUE(pb_user_id) enforces one company per user."""
    __tablename__ = "user_companies"
    __table_args__ = (
        UniqueConstraint("pb_user_id", name="uq_user_companies_pb_user_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    pb_user_id = Column(String(255), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
