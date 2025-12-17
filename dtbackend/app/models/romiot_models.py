from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
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
        UniqueConstraint('station_id', 'aselsan_order_number', 'order_item_number', name='uq_work_order_keys'),
    )

    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(Integer, ForeignKey("stations.id"), nullable=False)
    # user_id references users table in the PRIMARY database (not RomIOT database)
    # Since foreign keys can't span databases, we store it as a plain integer
    # without a foreign key constraint. Referential integrity must be handled in application logic.
    user_id = Column(Integer, nullable=False, index=True)
    manufacturer_number = Column(String(255), nullable=False)
    aselsan_order_number = Column(String(255), nullable=False)
    aselsan_work_order_number = Column(String(255), nullable=False)
    order_item_number = Column(String(255), nullable=False)
    quantity = Column(Integer, nullable=False)
    entrance_date = Column(DateTime(timezone=True), server_default=func.now())
    exit_date = Column(DateTime(timezone=True), nullable=True)

    # relationships
    station = relationship("Station", back_populates="work_orders")
