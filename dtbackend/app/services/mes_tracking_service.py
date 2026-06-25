"""Ürünüm Nerede tracker — external MES (AFLOW) data source.

Reads Mes_ProductionOrders_<company> per Hedef Firma (configured in the
`urunum_nerede_mes_sources` Postgres table) and assembles the existing
TrackResponse shape. pyodbc reads run in a worker thread (pyodbc is sync).
"""
import re

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

    if filter_column and filter_value is not None:
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
