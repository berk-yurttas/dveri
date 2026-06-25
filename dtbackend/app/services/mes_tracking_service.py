"""Ürünüm Nerede tracker — external MES (AFLOW) data source.

Reads Mes_ProductionOrders_<company> per Hedef Firma (configured in the
`urunum_nerede_mes_sources` Postgres table) and assembles the existing
TrackResponse shape. pyodbc reads run in a worker thread (pyodbc is sync).
"""
import re
from datetime import date, datetime

from app.schemas.order_pair import OrderPair
from app.schemas.work_order import TrackMatch, TrackResponse, TrackTimelineStep

# Identifier safety: table/column names are interpolated into SQL (they cannot
# be pyodbc bind parameters), so they must be strictly alphanumeric/underscore.
_IDENT_RE = re.compile(r"^[A-Za-z0-9_]+$")

# Columns selected from the MES table (see spec §4).
_SELECT_COLUMNS = (
    "AselsanOrderCode", "WorkOrderItemNo", "ProductCode", "RevisionNo",
    "OperationDesc", "Mes_MachineGroup", "OperationCode", "OrderStatus",
    "ActualStartDate", "ActualEndDate", "NeedDate", "AselsanSectorCode",
    "SubcontractorID", "WorkOrderAmount", "PlannedQuantity",
)


def _validate_identifier(name: str) -> str:
    if not name or not _IDENT_RE.match(name):
        raise ValueError(f"Geçersiz SQL tanımlayıcısı: {name!r}")
    return name


def build_track_query(
    *,
    table_name: str,
    filter_column: str | None,
    filter_value: str | None,
    order_number: str | None,
    order_item_number: str | None,
    part_number: str | None,
) -> tuple[str, list]:
    """Build the parameterized SELECT against the configured MES table.

    Returns (sql, params). Identifiers (table/column) are validated and
    interpolated; all values are pyodbc ``?`` bind params in `params` order.
    """
    table = _validate_identifier(table_name)
    columns = ", ".join(_SELECT_COLUMNS)
    clauses: list[str] = ["1 = 1"]
    params: list = []

    if filter_column:
        if filter_value is None:
            raise ValueError(
                f"filter_column {filter_column!r} ayarlı ama filter_value boş (None)"
            )
        col = _validate_identifier(filter_column)
        clauses.append(f"{col} = ?")
        params.append(filter_value)

    if order_number and order_item_number:
        clauses.append("AselsanOrderCode = ?")
        clauses.append("WorkOrderItemNo = ?")
        params.append(order_number)
        params.append(order_item_number)
    elif part_number:
        clauses.append("ProductCode LIKE ?")
        params.append(f"%{part_number}%")

    clauses.append("(IsDeleted = 0 OR IsDeleted IS NULL)")

    sql = (
        f"SELECT {columns} FROM dbo.[{table}] "
        f"WHERE {' AND '.join(clauses)}"
    )
    return sql, params


def _to_date(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return None


def _step_status(start, end, need_date: date | None, today: date) -> str:
    if end is not None:
        return "done"
    if start is not None:
        if need_date is not None and need_date < today:
            return "delayed"
        return "active"
    return "waiting"


def _sort_key(row) -> tuple:
    raw = row.get("Mes_MachineGroup")
    try:
        order = (0, int(raw))
    except (TypeError, ValueError):
        order = (1, str(raw or ""))
    start = row.get("ActualStartDate") or datetime.max
    return (order, start)


def _int_or_zero(value) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _build_one_match(rows: list[dict], *, hedef_firma, company_name_by_code, today) -> TrackMatch:
    ordered = sorted(rows, key=_sort_key)
    first = ordered[0]
    need_date = _to_date(first.get("NeedDate"))

    steps: list[TrackTimelineStep] = []
    for i, row in enumerate(ordered):
        start = row.get("ActualStartDate")
        end = row.get("ActualEndDate")
        steps.append(TrackTimelineStep(
            position=i + 1,
            station_id=i + 1,
            station_name=str(row.get("OperationDesc") or "—"),
            is_exit_station=(i == len(ordered) - 1),
            status=_step_status(start, end, _to_date(row.get("NeedDate")), today),
            entry_date=start,
            exit_date=end,
        ))

    # current location: last active step, else last done step, else None
    active = [s for s in steps if s.status in ("active", "delayed")]
    done = [s for s in steps if s.status == "done"]
    if active:
        current = active[-1]
        current_name, current_entry = current.station_name, current.entry_date
    elif done:
        current_name, current_entry = done[-1].station_name, None
    else:
        current_name, current_entry = None, None

    # group status rollup
    if steps and all(s.status == "done" for s in steps):
        status = "Tamamlandı"
    elif any(s.status == "delayed" for s in steps):
        status = "Gecikmiş"
    elif active and steps[-1].status == "active" and steps[-1].is_exit_station:
        status = "Sevke Hazır"
    elif active:
        status = "İşlemde"
    else:
        status = "Girişi yapılmadı"

    all_dates = [d for r in ordered for d in (r.get("ActualStartDate"), r.get("ActualEndDate")) if d is not None]
    last_updated = max(all_dates) if all_dates else None

    sub_code = str(first.get("SubcontractorID") or "")
    company_from = company_name_by_code.get(sub_code) or sub_code

    return TrackMatch(
        work_order_group_id=f"{first.get('AselsanOrderCode')}-{first.get('WorkOrderItemNo')}",
        part_number=str(first.get("ProductCode") or ""),
        revision_number=(str(first["RevisionNo"]) if first.get("RevisionNo") else None),
        pairs=[OrderPair(
            aselsan_order_number=str(first.get("AselsanOrderCode") or ""),
            order_item_number=str(first.get("WorkOrderItemNo") or ""),
        )],
        main_customer="",
        sector=str(first.get("AselsanSectorCode") or ""),
        company_from=company_from,
        coating_company=hedef_firma,
        teklif_number="",
        total_quantity=_int_or_zero(first.get("WorkOrderAmount")) or _int_or_zero(first.get("PlannedQuantity")),
        total_packages=1,
        target_date=need_date,
        current_station_name=current_name,
        current_entry_date=current_entry,
        status=status,
        last_updated=last_updated,
        has_route=len(steps) > 1,
        timeline=steps,
        packages=[],
    )


def assemble_matches(rows: list[dict], *, hedef_firma: str, company_name_by_code: dict, today: date) -> list[TrackMatch]:
    """Group MES rows by (AselsanOrderCode, WorkOrderItemNo) → one TrackMatch each."""
    groups: dict[tuple, list[dict]] = {}
    for row in rows:
        key = (row.get("AselsanOrderCode"), row.get("WorkOrderItemNo"))
        groups.setdefault(key, []).append(row)
    return [
        _build_one_match(grp, hedef_firma=hedef_firma, company_name_by_code=company_name_by_code, today=today)
        for grp in groups.values()
    ]
