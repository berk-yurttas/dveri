import asyncio
import csv
import re
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time as dt_time
from decimal import Decimal
from threading import Lock
from typing import Any, Callable
from uuid import UUID

from clickhouse_driver import Client
from sqlalchemy import and_, delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core.platform_db import DatabaseConnectionFactory
from app.models.postgres_models import (
    Platform,
    Report,
    ReportQuery,
    ReportQueryFilter,
    ReportTab,
    ReportUser,
    User,
)
from app.schemas.reports import (
    FilterValue,
    QueryExecutionResult,
    ReportCreate,
    ReportExecutionRequest,
    ReportExecutionResponse,
    ReportFullUpdate,
    ReportList,
    ReportUpdate,
)
from app.schemas.user import User as UserSchema
from app.services.user_service import UserService


class ConnectionPool:
    """Singleton connection pool for database connections"""
    _instance = None
    _lock = Lock()
    _pools: dict[str, Any] = {}
    _clickhouse_clients: dict[str, Client] = {}

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def _get_pool_key(self, db_config: dict[str, Any], db_type: str, platform_id: int | None = None) -> str:
        """Generate a unique key for connection pool based on db_config or platform"""
        if platform_id:
            return f"{db_type}_{platform_id}"
        
        # Create hash from db_config for custom configs
        import hashlib
        import json
        config_str = json.dumps({
            'host': db_config.get('host'),
            'port': db_config.get('port'),
            'database': db_config.get('database'),
            'user': db_config.get('user'),
            'db_type': db_type
        }, sort_keys=True)
        config_hash = hashlib.md5(config_str.encode()).hexdigest()[:8]
        return f"{db_type}_{config_hash}"

    def get_connection(self, db_config: dict[str, Any] | None = None, platform: Platform | None = None, db_type: str | None = None):
        """Get or create a connection from pool
        
        Args:
            db_config: Database configuration dict (takes priority)
            platform: Platform instance (fallback)
            db_type: Database type ('postgresql', 'mssql', 'clickhouse')
        
        Returns:
            Database connection from pool
        """
        # Determine db_type and config
        if db_config:
            actual_db_type = db_type or db_config.get('db_type', 'postgresql').lower()
            actual_config = db_config
            pool_key = self._get_pool_key(db_config, actual_db_type)
        elif platform:
            actual_db_type = db_type or platform.db_type.lower()
            actual_config = platform.db_config or {}
            pool_key = self._get_pool_key(actual_config, actual_db_type, platform.id)
        else:
            raise ValueError("Either db_config or platform must be provided")

        # Special handling for ClickHouse (keep persistent client)
        if actual_db_type == "clickhouse":
            if pool_key not in self._clickhouse_clients:
                with self._lock:
                    if pool_key not in self._clickhouse_clients:
                        self._clickhouse_clients[pool_key] = self._create_clickhouse_client(actual_config)
            return self._clickhouse_clients[pool_key]

        # For PostgreSQL and MSSQL, use connection pools
        if pool_key not in self._pools:
            with self._lock:
                if pool_key not in self._pools:
                    self._pools[pool_key] = self._create_pool(actual_config, actual_db_type)

        pool = self._pools[pool_key]
        
        if actual_db_type == "postgresql":
            return pool.getconn()
        elif actual_db_type == "mssql":
            # MSSQL doesn't have built-in pooling, create new connection
            # (We could implement a custom pool later if needed)
            return self._create_mssql_connection(actual_config)
        else:
            raise ValueError(f"Unsupported database type: {actual_db_type}")

    def return_connection(self, conn, db_config: dict[str, Any] | None = None, platform: Platform | None = None, db_type: str | None = None):
        """Return connection to pool
        
        Args:
            conn: Database connection to return
            db_config: Database configuration dict (takes priority)
            platform: Platform instance (fallback)
            db_type: Database type
        """
        # Determine db_type and pool_key
        if db_config:
            actual_db_type = db_type or db_config.get('db_type', 'postgresql').lower()
            pool_key = self._get_pool_key(db_config, actual_db_type)
        elif platform:
            actual_db_type = db_type or platform.db_type.lower()
            actual_config = platform.db_config or {}
            pool_key = self._get_pool_key(actual_config, actual_db_type, platform.id)
        else:
            # If we can't determine pool, just close the connection
            if hasattr(conn, 'close'):
                conn.close()
            return

        # Don't return ClickHouse clients - they stay persistent
        if actual_db_type == "clickhouse":
            return

        # Return PostgreSQL connections to pool
        if actual_db_type == "postgresql" and pool_key in self._pools:
            try:
                self._pools[pool_key].putconn(conn)
            except Exception:
                # If error returning to pool, just close it
                if hasattr(conn, 'close'):
                    conn.close()
        else:
            # For MSSQL and others, just close the connection
            if hasattr(conn, 'close'):
                conn.close()

    def _create_pool(self, db_config: dict[str, Any], db_type: str):
        """Create a connection pool based on database type"""
        if db_type == "postgresql":
            from psycopg2 import pool
            return pool.ThreadedConnectionPool(
                minconn=2,
                maxconn=20,
                host=db_config.get("host", "localhost"),
                port=int(db_config.get("port", 5432)),
                database=db_config.get("database"),
                user=db_config.get("user"),
                password=db_config.get("password")
            )
        else:
            raise ValueError(f"Unsupported database type for pooling: {db_type}")

    def _create_clickhouse_client(self, db_config: dict[str, Any]) -> Client:
        """Create a ClickHouse client"""
        return Client(
            host=db_config.get("host", "localhost"),
            port=int(db_config.get("port", 9000)),
            user=db_config.get("user", "default"),
            password=db_config.get("password", ""),
            database=db_config.get("database", "default"),
            settings=db_config.get("settings", {})
        )

    def _create_mssql_connection(self, db_config: dict[str, Any]):
        """Create an MSSQL connection"""
        import pyodbc
        driver = db_config.get("driver", "{ODBC Driver 17 for SQL Server}")
        connection_string = (
            f"DRIVER={driver};"
            f"SERVER={db_config.get('host', 'localhost')},{db_config.get('port', 1433)};"
            f"DATABASE={db_config.get('database')};"
            f"UID={db_config.get('user')};"
            f"PWD={db_config.get('password')}"
        )
        return pyodbc.connect(connection_string)


class _CsvCopySink:
    """File-like target for psycopg2 copy_expert that parses CSV records as they stream in."""

    def __init__(
        self,
        on_header: Callable[[list[str]], None],
        on_batch: Callable[[list[list[str]]], None],
        batch_size: int = 20_000,
    ):
        self._on_header = on_header
        self._on_batch = on_batch
        self._batch_size = batch_size
        self._buf = ""
        self._batch: list[list[str]] = []
        self.header: list[str] | None = None

    def write(self, data):
        if not data:
            return
        if isinstance(data, (bytes, bytearray, memoryview)):
            data = bytes(data).decode("utf-8")
        self._buf += data
        self._consume(final=False)

    def writelines(self, lines):
        for line in lines:
            self.write(line)

    def flush(self):
        self._consume(final=True)
        self._flush_batch()

    def _flush_batch(self):
        if self._batch:
            self._on_batch(self._batch)
            self._batch = []

    def _consume(self, final: bool):
        buf = self._buf
        in_quotes = False
        start = 0
        i = 0
        n = len(buf)
        while i < n:
            ch = buf[i]
            if ch == '"':
                if in_quotes and i + 1 < n and buf[i + 1] == '"':
                    i += 2
                    continue
                in_quotes = not in_quotes
            elif ch == "\n" and not in_quotes:
                record = buf[start:i]
                if record.endswith("\r"):
                    record = record[:-1]
                self._emit(record)
                start = i + 1
            i += 1
        self._buf = buf[start:]
        if final and self._buf:
            self._emit(self._buf.rstrip("\r"))
            self._buf = ""
        if final:
            self._flush_batch()

    def _emit(self, record: str):
        parsed = next(csv.reader([record]))
        if self.header is None:
            self.header = parsed
            self._on_header(parsed)
            return
        self._batch.append(parsed)
        if len(self._batch) >= self._batch_size:
            self._flush_batch()


# Trailing clauses that must stay after WHERE. Inject filters before these.
_SQL_TRAILING_CLAUSES = {
    "GROUP BY",
    "HAVING",
    "WINDOW",
    "QUALIFY",
    "ORDER BY",
    "LIMIT",
    "OFFSET",
    "FETCH",
    "SETTINGS",
    "FORMAT",
    "FOR UPDATE",
    "FOR SHARE",
}
_SQL_SET_OPS = {"UNION", "INTERSECT", "EXCEPT"}
_SQL_KEYWORD_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"UNION\s+ALL\b", re.IGNORECASE), "UNION"),
    (re.compile(r"UNION\s+DISTINCT\b", re.IGNORECASE), "UNION"),
    (re.compile(r"INTERSECT\s+ALL\b", re.IGNORECASE), "INTERSECT"),
    (re.compile(r"EXCEPT\s+ALL\b", re.IGNORECASE), "EXCEPT"),
    (re.compile(r"GROUP\s+BY\b", re.IGNORECASE), "GROUP BY"),
    (re.compile(r"ORDER\s+BY\b", re.IGNORECASE), "ORDER BY"),
    (re.compile(r"FOR\s+UPDATE\b", re.IGNORECASE), "FOR UPDATE"),
    (re.compile(r"FOR\s+SHARE\b", re.IGNORECASE), "FOR SHARE"),
    (re.compile(r"FETCH\s+(?:FIRST|NEXT)\b", re.IGNORECASE), "FETCH"),
    (re.compile(r"PREWHERE\b", re.IGNORECASE), "PREWHERE"),
    (re.compile(r"WHERE\b", re.IGNORECASE), "WHERE"),
    (re.compile(r"HAVING\b", re.IGNORECASE), "HAVING"),
    (re.compile(r"WINDOW\b", re.IGNORECASE), "WINDOW"),
    (re.compile(r"QUALIFY\b", re.IGNORECASE), "QUALIFY"),
    (re.compile(r"LIMIT\b", re.IGNORECASE), "LIMIT"),
    (re.compile(r"OFFSET\b", re.IGNORECASE), "OFFSET"),
    (re.compile(r"FETCH\b", re.IGNORECASE), "FETCH"),
    (re.compile(r"SETTINGS\b", re.IGNORECASE), "SETTINGS"),
    (re.compile(r"FORMAT\b", re.IGNORECASE), "FORMAT"),
    (re.compile(r"UNION\b", re.IGNORECASE), "UNION"),
    (re.compile(r"INTERSECT\b", re.IGNORECASE), "INTERSECT"),
    (re.compile(r"EXCEPT\b", re.IGNORECASE), "EXCEPT"),
    (re.compile(r"SELECT\b", re.IGNORECASE), "SELECT"),
    (re.compile(r"FROM\b", re.IGNORECASE), "FROM"),
]
_SQL_DOLLAR_QUOTE_RE = re.compile(r"\$[A-Za-z0-9_]*\$")
_SQL_HOIST_CLAUSES = {"LIMIT", "OFFSET", "FETCH", "SETTINGS", "FORMAT"}
_SQL_AS_RE = re.compile(r"AS\b", re.IGNORECASE)
_SQL_WRAP_ALIAS = "_dt_filtered"


def _skip_sql_noise(sql: str, i: int, end: int | None = None) -> int:
    """Advance past a comment or quoted literal at i. Returns i unchanged if none."""
    n = len(sql) if end is None else min(end, len(sql))
    if i >= n:
        return i
    ch = sql[i]
    nxt = sql[i + 1] if i + 1 < n else ""
    if ch == "-" and nxt == "-":
        i += 2
        while i < n and sql[i] not in "\r\n":
            i += 1
        return i
    if ch == "#":
        while i < n and sql[i] not in "\r\n":
            i += 1
        return i
    if ch == "/" and nxt == "*":
        i += 2
        while i + 1 < n and not (sql[i] == "*" and sql[i + 1] == "/"):
            i += 1
        return min(i + 2, n)
    if ch == "'":
        i += 1
        while i < n:
            if sql[i] == "'":
                if i + 1 < n and sql[i + 1] == "'":
                    i += 2
                    continue
                return i + 1
            i += 1
        return n
    if ch == '"':
        i += 1
        while i < n:
            if sql[i] == '"':
                if i + 1 < n and sql[i + 1] == '"':
                    i += 2
                    continue
                return i + 1
            i += 1
        return n
    if ch == "`":
        close = sql.find("`", i + 1, n)
        return n if close < 0 else close + 1
    if ch == "[":
        close = sql.find("]", i + 1, n)
        return n if close < 0 else close + 1
    if ch == "$":
        tag_match = _SQL_DOLLAR_QUOTE_RE.match(sql, i)
        if tag_match and tag_match.end() <= n:
            tag = tag_match.group(0)
            close = sql.find(tag, tag_match.end(), n)
            return n if close < 0 else close + len(tag)
    return i


def _scan_sql_keywords(sql: str) -> list[tuple[str, int, int, int]]:
    """Return (keyword, start, end, paren_depth) for SQL keywords, skipping literals/comments."""
    keywords: list[tuple[str, int, int, int]] = []
    i = 0
    n = len(sql)
    depth = 0
    while i < n:
        skipped = _skip_sql_noise(sql, i)
        if skipped != i:
            i = skipped
            continue
        ch = sql[i]
        if ch == "(":
            depth += 1
            i += 1
            continue
        if ch == ")":
            depth = max(0, depth - 1)
            i += 1
            continue

        if ch.isalpha() or ch == "_":
            matched = False
            for pattern, name in _SQL_KEYWORD_PATTERNS:
                match = pattern.match(sql, i)
                if match:
                    keywords.append((name, match.start(), match.end(), depth))
                    i = match.end()
                    matched = True
                    break
            if not matched:
                i += 1
                while i < n and (sql[i].isalnum() or sql[i] in "_$"):
                    i += 1
            continue
        i += 1
    return keywords


def _rtrim_sql_index(sql: str, end: int) -> int:
    i = min(end, len(sql))
    while i > 0 and sql[i - 1].isspace():
        i -= 1
    if i > 0 and sql[i - 1] == ";" and end >= len(sql.rstrip()):
        i -= 1
        while i > 0 and sql[i - 1].isspace():
            i -= 1
    return i


def _simple_ident(expr: str | None) -> str | None:
    if not expr:
        return None
    expr = expr.strip()
    if len(expr) >= 2 and expr[0] == '"' and expr[-1] == '"':
        return expr[1:-1].replace('""', '"')
    if len(expr) >= 2 and expr[0] == "[" and expr[-1] == "]":
        return expr[1:-1]
    if len(expr) >= 2 and expr[0] == "`" and expr[-1] == "`":
        return expr[1:-1]
    if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_$]*", expr):
        return expr
    return None


def _read_sql_ident(sql: str, i: int, end: int) -> tuple[str | None, int]:
    while i < end and sql[i].isspace():
        i += 1
    if i >= end:
        return None, i
    if sql[i] == '"':
        j = i + 1
        while j < end:
            if sql[j] == '"':
                if j + 1 < end and sql[j + 1] == '"':
                    j += 2
                    continue
                return sql[i + 1:j].replace('""', '"'), j + 1
            j += 1
        return None, i
    if sql[i] == "[":
        close = sql.find("]", i + 1, end)
        if close < 0:
            return None, i
        return sql[i + 1:close], close + 1
    if sql[i] == "`":
        close = sql.find("`", i + 1, end)
        if close < 0:
            return None, i
        return sql[i + 1:close], close + 1
    if sql[i].isalpha() or sql[i] == "_":
        j = i + 1
        while j < end and (sql[j].isalnum() or sql[j] in "_$"):
            j += 1
        return sql[i:j], j
    return None, i


def _skip_balanced_paren(sql: str, open_paren: int, end: int) -> int:
    depth = 0
    i = open_paren
    while i < end:
        skipped = _skip_sql_noise(sql, i, end)
        if skipped != i:
            i = skipped
            continue
        if sql[i] == "(":
            depth += 1
        elif sql[i] == ")":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return end


def _skip_select_modifiers(sql: str, start: int, end: int) -> int:
    i = start
    while i < end:
        while i < end and sql[i].isspace():
            i += 1
        on_match = re.match(r"DISTINCT\s+ON\s*\(", sql[i:end], re.IGNORECASE)
        if on_match:
            paren_at = sql.find("(", i, end)
            i = _skip_balanced_paren(sql, paren_at, end) if paren_at >= 0 else end
            continue
        simple = re.match(r"(DISTINCT|ALL)\b", sql[i:end], re.IGNORECASE)
        if simple:
            i += simple.end()
            continue
        top = re.match(r"TOP\s*(?:\(\s*\d+\s*\)|\d+)(?:\s+PERCENT)?(?:\s+WITH\s+TIES)?\b", sql[i:end], re.IGNORECASE)
        if top:
            i += top.end()
            continue
        break
    return i


def _split_select_items(sql: str, start: int, end: int) -> list[tuple[int, int]]:
    items: list[tuple[int, int]] = []
    item_start = start
    i = start
    depth = 0
    while i < end:
        skipped = _skip_sql_noise(sql, i, end)
        if skipped != i:
            i = skipped
            continue
        ch = sql[i]
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        elif ch == "," and depth == 0:
            items.append((item_start, i))
            item_start = i + 1
        i += 1
    items.append((item_start, end))
    return items


def _select_item_alias(sql: str, start: int, end: int) -> str | None:
    i = start
    while i < end and sql[i].isspace():
        i += 1
    if i >= end:
        return None
    item_begin = i
    last_ident: str | None = None
    last_ident_start = -1
    depth = 0
    while i < end:
        skipped = _skip_sql_noise(sql, i, end)
        if skipped != i:
            i = skipped
            continue
        if sql[i].isspace():
            i += 1
            continue
        if sql[i] == "(":
            depth += 1
            i += 1
            continue
        if sql[i] == ")":
            depth = max(0, depth - 1)
            i += 1
            continue
        if depth == 0:
            as_match = _SQL_AS_RE.match(sql, i)
            if as_match and as_match.end() <= end:
                alias, _after = _read_sql_ident(sql, as_match.end(), end)
                return alias
            ident, after = _read_sql_ident(sql, i, end)
            if ident is not None:
                last_ident = ident
                last_ident_start = i
                i = after
                continue
        i += 1
    if last_ident is None or last_ident == "*" or last_ident_start <= item_begin:
        return None
    j = last_ident_start - 1
    while j >= item_begin and sql[j].isspace():
        j -= 1
    if j >= item_begin and sql[j] == ".":
        return None
    return last_ident


def _first_outer_select_list_span(sql: str) -> tuple[int, int] | None:
    keywords = _scan_sql_keywords(sql)
    selects = [kw for kw in keywords if kw[0] == "SELECT"]
    if not selects:
        return None
    min_depth = min(kw[3] for kw in selects)
    first_select = next(kw for kw in selects if kw[3] == min_depth)
    region_end = len(sql)
    for name, start, _end, depth in keywords:
        if depth == min_depth and name in _SQL_SET_OPS and start > first_select[1]:
            region_end = start
            break
    froms = [
        kw for kw in keywords
        if kw[0] == "FROM" and kw[3] == min_depth and first_select[1] < kw[1] < region_end
    ]
    if not froms:
        return None
    return first_select[2], froms[0][1]


def select_aliases(sql: str) -> set[str]:
    """Return lowercase SELECT aliases from the final/first outer query."""
    span = _first_outer_select_list_span(sql)
    if not span:
        return set()
    start, end = span
    start = _skip_select_modifiers(sql, start, end)
    aliases: set[str] = set()
    for item_start, item_end in _split_select_items(sql, start, end):
        alias = _select_item_alias(sql, item_start, item_end)
        if alias:
            aliases.add(alias.lower())
    return aliases


def wrap_query_with_where(sql: str, condition: str) -> str:
    """Wrap the query so SELECT aliases can be filtered as result columns."""
    if not sql or not str(sql).strip() or not condition or not str(condition).strip():
        return sql

    body = str(sql).strip()
    semicolon = body.endswith(";")
    if semicolon:
        body = body[:-1].rstrip()

    trailing = ""
    keywords = _scan_sql_keywords(body)
    selects = [kw for kw in keywords if kw[0] == "SELECT"]
    if selects:
        min_depth = min(kw[3] for kw in selects)
        froms = [kw for kw in keywords if kw[0] == "FROM" and kw[3] == min_depth]
        search_after = froms[0][1] if froms else selects[0][1]
        hoist = [
            kw for kw in keywords
            if kw[0] in _SQL_HOIST_CLAUSES and kw[3] == min_depth and kw[1] > search_after
        ]
        if hoist:
            cut = hoist[0][1]
            trailing = " " + body[cut:].strip()
            body = body[:cut].rstrip()

    wrapped = f"SELECT * FROM ({body}) AS {_SQL_WRAP_ALIAS} WHERE ({condition.strip()})"
    if trailing:
        wrapped += trailing
    if semicolon:
        wrapped += ";"
    return wrapped


def inject_where_condition(sql: str, condition: str) -> str:
    """Add a boolean condition to the final query's WHERE clause.

    Nested/CTE WHERE clauses are ignored. If the outermost (or last UNION branch)
    query has a WHERE, the condition is ANDed onto it. Otherwise a WHERE is
    created before GROUP BY / HAVING / ORDER BY / LIMIT / similar trailing clauses.
    """
    if not sql or not str(sql).strip() or not condition or not str(condition).strip():
        return sql

    condition = str(condition).strip()
    keywords = _scan_sql_keywords(sql)
    selects = [kw for kw in keywords if kw[0] == "SELECT"]
    if not selects:
        insert_at = _rtrim_sql_index(sql, len(sql))
        injection = f" WHERE ({condition})"
        if insert_at < len(sql) and not sql[insert_at].isspace():
            injection += " "
        return sql[:insert_at] + injection + sql[insert_at:]

    min_depth = min(kw[3] for kw in selects)
    outer_selects = [kw for kw in selects if kw[3] == min_depth]
    final_select = outer_selects[-1]
    region_start = final_select[1]
    region_end = len(sql)
    for name, start, _end, depth in keywords:
        if depth == min_depth and name in _SQL_SET_OPS and start > region_start:
            region_end = start
            break

    def _in_final_query(kw: tuple[str, int, int, int]) -> bool:
        _name, start, _end, depth = kw
        return depth == min_depth and region_start <= start < region_end

    froms = [kw for kw in keywords if kw[0] == "FROM" and _in_final_query(kw)]
    # WHERE / GROUP BY / ORDER BY belong after FROM, so names in the SELECT list
    # (format, limit, window, ...) are not treated as trailing clauses.
    search_after = froms[0][1] if froms else region_start

    def _after_from(kw: tuple[str, int, int, int]) -> bool:
        return _in_final_query(kw) and kw[1] > search_after

    wheres = [kw for kw in keywords if kw[0] == "WHERE" and _after_from(kw)]
    trailers = [
        kw for kw in keywords
        if kw[0] in _SQL_TRAILING_CLAUSES and _after_from(kw)
    ]

    if wheres:
        where_start = wheres[-1][1]
        after_where = [kw for kw in trailers if kw[1] > where_start]
        insert_at = after_where[0][1] if after_where else _rtrim_sql_index(sql, region_end)
        injection = f" AND ({condition})"
    else:
        insert_at = trailers[0][1] if trailers else _rtrim_sql_index(sql, region_end)
        injection = f" WHERE ({condition})"

    if insert_at < len(sql) and not sql[insert_at].isspace():
        injection += " "
    return sql[:insert_at] + injection + sql[insert_at:]


NESTED_EXPORT_CONCURRENCY = 8


def extract_expandable_nested_queries(visualization: Any) -> list[dict[str, Any]]:
    """Return nestedQueries for expandable table visualizations."""
    if not isinstance(visualization, dict):
        return []
    raw_type = visualization.get("type") or ""
    if hasattr(raw_type, "value"):
        raw_type = raw_type.value
    if str(raw_type).lower() != "expandable":
        return []
    chart = visualization.get("chartOptions") or visualization.get("chart_options") or {}
    if not isinstance(chart, dict):
        chart = {}
    nested = (
        chart.get("nestedQueries")
        or chart.get("nested_queries")
        or visualization.get("nestedQueries")
        or visualization.get("nested_queries")
        or []
    )
    return nested if isinstance(nested, list) else []


def apply_expandable_placeholders(
    sql: str,
    expandable_fields: list[str],
    parent_columns: list[str],
    row: list[Any],
) -> str:
    processed = sql or ""
    for field in expandable_fields or []:
        try:
            column_index = parent_columns.index(field)
        except ValueError:
            continue
        value = row[column_index] if column_index < len(row) else ""
        escaped = str(value if value is not None else "").replace("'", "''")
        processed = re.sub(re.escape(f"{{{{{field}}}}}"), f"'{escaped}'", processed)
    return processed


def _uniquify_child_columns(parent_columns: list[str], child_columns: list[str], level: int) -> list[str]:
    used = set(parent_columns)
    unique: list[str] = []
    for col in child_columns:
        name = col
        if name in used:
            name = f"{col} (L{level})"
        suffix = 2
        while name in used:
            name = f"{col} (L{level}_{suffix})"
            suffix += 1
        used.add(name)
        unique.append(name)
    return unique


def _align_export_row(row: list[Any], source_columns: list[str], target_columns: list[str]) -> list[Any]:
    index_by_column = {col: index for index, col in enumerate(source_columns)}
    aligned: list[Any] = []
    for col in target_columns:
        index = index_by_column.get(col)
        aligned.append("" if index is None or index >= len(row) else row[index])
    return aligned


def _combine_nested_tables(tables: list[tuple[list[str], list[list[Any]]]]) -> tuple[list[str], list[list[Any]]]:
    columns: list[str] = []
    seen: set[str] = set()
    for table_columns, _rows in tables:
        for col in table_columns:
            if col in seen:
                continue
            seen.add(col)
            columns.append(col)
    data: list[list[Any]] = []
    for table_columns, rows in tables:
        for row in rows:
            data.append(_align_export_row(row, table_columns, columns))
    return columns, data


def flatten_nested_export(
    parent_columns: list[str],
    parent_data: list[list[Any]],
    nested_queries: list[dict[str, Any]],
    fetch_sql: Callable[[str], tuple[list[str], list[list[Any]]]],
    level: int = 1,
    concurrency: int = NESTED_EXPORT_CONCURRENCY,
) -> tuple[list[str], list[list[Any]]]:
    """Denormalize expandable nested query results onto parent rows."""
    if not nested_queries or not parent_data:
        return parent_columns, parent_data

    def expand_parent(parent_row: list[Any]) -> tuple[list[str], list[list[Any]]]:
        tables: list[tuple[list[str], list[list[Any]]]] = []
        for nested_query in nested_queries:
            if not isinstance(nested_query, dict):
                continue
            sql = nested_query.get("sql") or ""
            fields = nested_query.get("expandableFields") or nested_query.get("expandable_fields") or []
            processed = apply_expandable_placeholders(sql, fields, parent_columns, parent_row)
            child_columns, child_rows = fetch_sql(processed)
            deeper = nested_query.get("nestedQueries") or nested_query.get("nested_queries") or []
            if deeper:
                child_columns, child_rows = flatten_nested_export(
                    child_columns,
                    child_rows,
                    deeper if isinstance(deeper, list) else [],
                    fetch_sql,
                    level + 1,
                    concurrency,
                )
            tables.append((child_columns, child_rows))
        if not tables:
            return [], []
        return _combine_nested_tables(tables)

    worker_count = min(max(concurrency, 1), len(parent_data))
    if worker_count <= 1:
        child_tables = [expand_parent(row) for row in parent_data]
    else:
        with ThreadPoolExecutor(max_workers=worker_count) as executor:
            child_tables = list(executor.map(expand_parent, parent_data))

    original_child_columns: list[str] = []
    seen_child: set[str] = set()
    for child_columns, _rows in child_tables:
        for col in child_columns:
            if col in seen_child:
                continue
            seen_child.add(col)
            original_child_columns.append(col)

    if not original_child_columns:
        return parent_columns, parent_data

    export_child_columns = _uniquify_child_columns(parent_columns, original_child_columns, level)
    export_columns = [*parent_columns, *export_child_columns]
    export_data: list[list[Any]] = []
    empty_child = [""] * len(original_child_columns)
    for parent_row, (child_columns, child_rows) in zip(parent_data, child_tables, strict=False):
        aligned_children = [
            _align_export_row(child_row, child_columns, original_child_columns)
            for child_row in child_rows
        ]
        if not aligned_children:
            export_data.append([*parent_row, *empty_child])
            continue
        for child_row in aligned_children:
            export_data.append([*parent_row, *child_row])
    return export_columns, export_data


class ReportsService:
    _connection_pool = ConnectionPool()

    def __init__(self, db: AsyncSession, clickhouse_client: Client | None = None):
        self.db = db
        self.clickhouse_client = clickhouse_client
    
    def _get_db_connection_from_config(self, db_config: dict[str, Any], db_type: str):
        """Get a database connection from db_config dict using connection pool"""
        return self._connection_pool.get_connection(db_config=db_config, db_type=db_type)
    
    def _return_connection_to_pool(self, conn, db_config: dict[str, Any] | None = None, platform: Platform | None = None, db_type: str | None = None):
        """Return a connection to the pool"""
        self._connection_pool.return_connection(conn, db_config=db_config, platform=platform, db_type=db_type)

    # Report CRUD Operations
    async def create_report(self, report_data: ReportCreate, user: UserSchema, platform: Platform | None = None) -> Report:
        """Create a new report with queries and filters"""
        db_user = await UserService.get_user_by_username(self.db, user.username)
        if not db_user:
            raise ValueError("User not found")

        # Serialize global filters to JSON
        global_filters_json = []
        if report_data.global_filters:
            for filter_data in report_data.global_filters:
                filter_type_value = filter_data.type.value if hasattr(filter_data.type, 'value') else filter_data.type
                global_filters_json.append({
                    'fieldName': filter_data.field_name,
                    'displayName': filter_data.display_name,
                    'type': filter_type_value,
                    'dropdownQuery': filter_data.dropdown_query,
                    'required': filter_data.required,
                    'sqlExpression': filter_data.sql_expression,
                    'dependsOn': filter_data.depends_on
                })

        # Create the main report
        db_report = Report(
            name=report_data.name,
            description=report_data.description,
            owner_id=db_user.id,
            is_public=report_data.is_public,
            tags=report_data.tags or [],
            global_filters=global_filters_json,
            platform_id=platform.id if platform else None,
            color=report_data.color or "#3B82F6",
            allowed_departments=report_data.allowed_departments or [],
            allowed_users=report_data.allowed_users or [],
            is_direct_link=report_data.is_direct_link or False,
            direct_link=report_data.direct_link,
            db_config=report_data.db_config,
            filter_by_department=report_data.filter_by_department or False,
            department_filter_level=report_data.department_filter_level,
            filter_by_step_department=report_data.filter_by_step_department or False
        )
        self.db.add(db_report)
        await self.db.flush()  # Get the report ID

        # Create tabs and queries only if not a direct link report
        if not report_data.is_direct_link:
            # If tabs are provided, create tabs with their queries
            if report_data.tabs and len(report_data.tabs) > 0:
                for tab_data in report_data.tabs:
                    db_tab = ReportTab(
                        report_id=db_report.id,
                        name=tab_data.name,
                        order_index=tab_data.order_index or 0,
                        layout_config=tab_data.layout_config or []
                    )
                    self.db.add(db_tab)
                    await self.db.flush()  # Get the tab ID

                    # Create queries for this tab
                    for query_data in tab_data.queries:
                        db_query = ReportQuery(
                            report_id=db_report.id,
                            tab_id=db_tab.id,
                            name=query_data.name,
                            sql=query_data.sql,
                            visualization_config=query_data.visualization.dict(),
                            order_index=query_data.order_index or 0
                        )
                        self.db.add(db_query)
                        await self.db.flush()  # Get the query ID

                        # Create filters for this query
                        for filter_data in query_data.filters:
                            filter_type_value = filter_data.type.value if hasattr(filter_data.type, 'value') else filter_data.type

                            db_filter = ReportQueryFilter(
                                query_id=db_query.id,
                                field_name=filter_data.field_name,
                                display_name=filter_data.display_name,
                                filter_type=filter_type_value,
                                dropdown_query=filter_data.dropdown_query,
                                required=filter_data.required,
                                sql_expression=filter_data.sql_expression,
                                depends_on=filter_data.depends_on
                            )
                            self.db.add(db_filter)
            
            # Otherwise, create queries without tabs (backward compatibility)
            else:
                for query_data in report_data.queries:
                    db_query = ReportQuery(
                        report_id=db_report.id,
                        tab_id=None,
                        name=query_data.name,
                        sql=query_data.sql,
                        visualization_config=query_data.visualization.dict(),
                        order_index=query_data.order_index or 0
                    )
                    self.db.add(db_query)
                    await self.db.flush()  # Get the query ID

                    # Create filters for this query
                    for filter_data in query_data.filters:
                        filter_type_value = filter_data.type.value if hasattr(filter_data.type, 'value') else filter_data.type

                        db_filter = ReportQueryFilter(
                            query_id=db_query.id,
                            field_name=filter_data.field_name,
                            display_name=filter_data.display_name,
                            filter_type=filter_type_value,
                            dropdown_query=filter_data.dropdown_query,
                            required=filter_data.required,
                            sql_expression=filter_data.sql_expression,
                            depends_on=filter_data.depends_on
                        )
                        self.db.add(db_filter)

        await self.db.commit()

        # Refresh and eagerly load relationships
        stmt = select(Report).options(
            selectinload(Report.tabs).selectinload(ReportTab.queries).selectinload(ReportQuery.filters),
            selectinload(Report.queries).selectinload(ReportQuery.filters)
        ).where(Report.id == db_report.id)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def get_report(self, report_id: int, user: UserSchema) -> Report | None:
        db_user = await UserService.get_user_by_username(self.db, user.username)
        if not db_user:
            raise ValueError("User not found")

        """Get a report by ID with all queries and filters (only if user owns it or it's public or has permission)"""
        from sqlalchemy.orm import joinedload
        from sqlalchemy import cast, String, literal
        from sqlalchemy.dialects.postgresql import ARRAY

        # Check if user is admin
        is_admin = user.role and "miras:admin" in user.role

        if is_admin:
            # Admin can access all reports
            stmt = select(Report).options(
                selectinload(Report.tabs).selectinload(ReportTab.queries).selectinload(ReportQuery.filters),
                selectinload(Report.queries).selectinload(ReportQuery.filters),
                selectinload(Report.odak_schedule),
                joinedload(Report.owner)
            ).where(and_(Report.id == report_id, Report.deleted_at.is_(None)))
        else:
            # Generate all parent departments for the user
            user_dept = user.department or ""
            dept_prefixes = []
            if user_dept:
                parts = user_dept.split('_')
                current = ""
                for part in parts:
                    current = f"{current}_{part}" if current else part
                    dept_prefixes.append(current)

            dept_prefixes_array = cast(dept_prefixes, ARRAY(String))

            stmt = select(Report).options(
                selectinload(Report.tabs).selectinload(ReportTab.queries).selectinload(ReportQuery.filters),
                selectinload(Report.queries).selectinload(ReportQuery.filters),
                selectinload(Report.odak_schedule),
                joinedload(Report.owner)
            ).where(
                and_(
                    Report.id == report_id,
                    Report.deleted_at.is_(None),  # Exclude deleted reports
                    or_(
                        Report.owner_id == db_user.id,
                        Report.is_public == True,
                        Report.allowed_users.op('@>')(cast([user.username], ARRAY(String))),
                        Report.allowed_departments.op('&&')(dept_prefixes_array)
                    )
                )
            )
        result = await self.db.execute(stmt)
        report = result.scalar_one_or_none()

        if report:
            report.owner_name = report.owner.name if report.owner else None

        return report

    async def get_report_for_export(self, report_id: int) -> Report | None:
        """
        Fetch a report (regardless of owner/visibility) with all tabs, queries
        and filters eagerly loaded. Intended for admin-only export/transfer
        functionality where the caller has already been authorized upstream.
        """
        stmt = select(Report).options(
            selectinload(Report.tabs).selectinload(ReportTab.queries).selectinload(ReportQuery.filters),
            selectinload(Report.queries).selectinload(ReportQuery.filters),
            joinedload(Report.owner)
        ).where(and_(Report.id == report_id, Report.deleted_at.is_(None)))

        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def export_report_transfer_sql(self, report_id: int) -> str | None:
        """Build a portable SQL script that transfers a report to another system."""
        report = await self.get_report_for_export(report_id)
        if not report:
            return None

        from app.services.report_export_service import generate_report_transfer_sql

        return generate_report_transfer_sql(report)

    async def get_reports(self, user: UserSchema, skip: int = 0, limit: int = 100, my_reports_only: bool = False) -> list[Report]:
        db_user = await UserService.get_user_by_username(self.db, user.username)
        if not db_user:
            raise ValueError("User not found")

        """Get reports for a user with all queries and filters (owned + public or only owned)"""
        from sqlalchemy.orm import joinedload
        from sqlalchemy import cast, String
        from sqlalchemy.dialects.postgresql import ARRAY

        # Check if user is admin
        is_admin = user.role and "miras:admin" in user.role

        if my_reports_only:
            stmt = select(Report).options(
                selectinload(Report.queries).selectinload(ReportQuery.filters),
                joinedload(Report.owner)
            ).where(
            ).where(
                and_(Report.owner_id == db_user.id, Report.deleted_at.is_(None))
            ).offset(skip).limit(limit)
        elif is_admin:
            # Admin sees all reports
            # Admin sees all reports
            stmt = select(Report).options(
                selectinload(Report.queries).selectinload(ReportQuery.filters),
                joinedload(Report.owner)
            ).where(Report.deleted_at.is_(None)).offset(skip).limit(limit)
        else:
            # Generate all parent departments for the user
            user_dept = user.department or ""
            dept_prefixes = []
            if user_dept:
                parts = user_dept.split('_')
                current = ""
                for part in parts:
                    current = f"{current}_{part}" if current else part
                    dept_prefixes.append(current)

            # dept_prefixes_array = cast(dept_prefixes, ARRAY(String))

            dept_prefixes_array = cast(dept_prefixes, ARRAY(String))

            stmt = select(Report).options(
                selectinload(Report.queries).selectinload(ReportQuery.filters),
                joinedload(Report.owner)
            ).where(
                and_(
                    Report.deleted_at.is_(None),  # Exclude deleted reports
                    or_(
                        Report.owner_id == db_user.id,
                        Report.is_public == True,
                        Report.allowed_users.op('@>')(cast([user.username], ARRAY(String))),
                        Report.allowed_departments.op('&&')(dept_prefixes_array)
                    )
                )
            ).offset(skip).limit(limit)

        result = await self.db.execute(stmt)
        reports = result.scalars().all()

        # Set owner_name for each report
        for report in reports:
            report.owner_name = report.owner.name if report.owner else None

        return reports

    async def get_reports_list(self, user: UserSchema, skip: int = 0, limit: int = 100, my_reports_only: bool = False, platform: Platform | None = None, subplatform: str | None = None) -> list[ReportList]:
        """Get reports list for a user (without nested queries and filters for performance)"""
        db_user = await UserService.get_user_by_username(self.db, user.username)
        if not db_user:
            raise ValueError("User not found")

        from sqlalchemy import String, and_, cast, func
        from sqlalchemy.dialects.postgresql import ARRAY

        # Build base conditions
        from sqlalchemy import or_, and_, cast, String, literal
        from sqlalchemy.dialects.postgresql import ARRAY

        # Check if user is admin
        is_admin = user.role and "miras:admin" in user.role

        if my_reports_only:
            base_condition = and_(Report.owner_id == db_user.id, Report.deleted_at.is_(None))
        elif is_admin:
            # Admin sees all reports - no condition needed
            base_condition = Report.deleted_at.is_(None)
        else:
            # Access logic:
            # 1. Owner
            # 2. Public
            # 3. In allowed_users
            # 4. In allowed_departments (checking all parent departments of user's department)

            # Generate all parent departments for the user (e.g. "A_B_C" -> ["A_B_C", "A_B", "A"])
            user_dept = user.department or ""
            dept_prefixes = []
            if user_dept:
                parts = user_dept.split('_')
                current = ""
                for part in parts:
                    current = f"{current}_{part}" if current else part
                    dept_prefixes.append(current)

            # If no department, just check empty array overlap (which is false)
            dept_prefixes_array = cast(dept_prefixes, ARRAY(String))

            base_condition = and_(
                Report.deleted_at.is_(None),
                or_(
                    Report.owner_id == db_user.id,
                    Report.is_public == True,
                    Report.allowed_users.op('@>')(cast([user.username], ARRAY(String))),
                    Report.allowed_departments.op('&&')(dept_prefixes_array)
                )
            )

        # Build filter conditions
        filters = [base_condition]
        if platform:
            filters.append(Report.platform_id == platform.id)
        if subplatform:
            # Use PostgreSQL array @> operator (contains) with proper type casting
            filters.append(Report.tags.op('@>')(cast([subplatform], ARRAY(String))))

        stmt = select(
            Report.id,
            Report.name,
            Report.description,
            Report.is_public,
            Report.owner_id,
            Report.created_at,
            Report.updated_at,
            Report.tags,
            Report.color,
            Report.is_direct_link,
            Report.direct_link,
            func.count(ReportQuery.id).label('query_count')
        ).outerjoin(ReportQuery).group_by(
            Report.id,
            Report.name,
            Report.description,
            Report.is_public,
            Report.owner_id,
            Report.created_at,
            Report.updated_at,
            Report.tags,
            Report.color,
            Report.is_direct_link,
            Report.direct_link
        ).where(
            and_(*filters)
        ).offset(skip).limit(limit)

        result = await self.db.execute(stmt)
        report_rows = result.all()

        # Get owner names for all reports
        owner_ids = list(set([row.owner_id for row in report_rows]))
        owner_stmt = select(User.id, User.name).where(User.id.in_(owner_ids))
        owner_result = await self.db.execute(owner_stmt)
        owner_map = {row.id: row.name for row in owner_result.all()}

        # Get favorite status for all reports
        report_ids = [row.id for row in report_rows]
        if not report_ids:
            favorite_ids = set()
        else:
            favorite_stmt = select(ReportUser.report_id).where(
                and_(ReportUser.user_id == db_user.id, ReportUser.report_id.in_(report_ids), ReportUser.is_favorite == True)
            )
            favorite_result = await self.db.execute(favorite_stmt)
            favorite_ids = {row.report_id for row in favorite_result.all()}

        # Build ReportList objects
        reports = []
        for row in report_rows:
            reports.append(ReportList(
                id=row.id,
                name=row.name,
                description=row.description,
                is_public=row.is_public,
                owner_id=row.owner_id,
                owner_name=owner_map.get(row.owner_id),
                created_at=row.created_at,
                updated_at=row.updated_at,
                tags=row.tags,
                query_count=row.query_count,
                is_favorite=row.id in favorite_ids,
                color=row.color,
                is_direct_link=row.is_direct_link or False,
                direct_link=row.direct_link
            ))

        return reports

    async def update_report(self, report_id: int, report_data: ReportUpdate, user: UserSchema, is_admin: bool = False) -> Report | None:
        db_user = await UserService.get_user_by_username(self.db, user.username)
        if not db_user:
            raise ValueError("User not found")

        """Update a report with queries and filters (only if user owns it)"""
        filters = [Report.id == report_id]
        if not is_admin:
            filters.append(Report.owner_id == db_user.id)

        stmt = select(Report).where(and_(*filters))
        result = await self.db.execute(stmt)
        db_report = result.scalar_one_or_none()

        if not db_report:
            return None

        # Update report metadata
        if report_data.name is not None:
            db_report.name = report_data.name
        if report_data.description is not None:
            db_report.description = report_data.description
        if report_data.is_public is not None:
            db_report.is_public = report_data.is_public
        if report_data.tags is not None:
            db_report.tags = report_data.tags
        if report_data.layout_config is not None:
            db_report.layout_config = report_data.layout_config
        if report_data.color is not None:
            db_report.color = report_data.color
        if report_data.allowed_departments is not None:
            db_report.allowed_departments = report_data.allowed_departments
        if report_data.allowed_users is not None:
            db_report.allowed_users = report_data.allowed_users
        if report_data.is_direct_link is not None:
            db_report.is_direct_link = report_data.is_direct_link
        if report_data.direct_link is not None:
            db_report.direct_link = report_data.direct_link
        if report_data.db_config is not None:
            db_report.db_config = report_data.db_config
        if report_data.filter_by_department is not None:
            db_report.filter_by_department = report_data.filter_by_department
        if report_data.department_filter_level is not None:
            db_report.department_filter_level = report_data.department_filter_level
        if report_data.filter_by_step_department is not None:
            db_report.filter_by_step_department = report_data.filter_by_step_department

        await self.db.commit()

        # Refresh and eagerly load relationships
        stmt = select(Report).options(
            selectinload(Report.tabs).selectinload(ReportTab.queries).selectinload(ReportQuery.filters),
            selectinload(Report.queries).selectinload(ReportQuery.filters)
        ).where(Report.id == db_report.id)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def update_report_full(self, report_id: int, report_data: ReportFullUpdate, user: UserSchema, is_admin: bool = False) -> Report | None:
        db_user = await UserService.get_user_by_username(self.db, user.username)
        if not db_user:
            raise ValueError("User not found")

        """Update a report with queries and filters (only if user owns it)"""
        filters = [Report.id == report_id]
        if not is_admin:
            filters.append(Report.owner_id == db_user.id)

        stmt = select(Report).options(
            selectinload(Report.tabs).selectinload(ReportTab.queries).selectinload(ReportQuery.filters),
            selectinload(Report.queries).selectinload(ReportQuery.filters)
        ).where(and_(*filters))
        result = await self.db.execute(stmt)
        db_report = result.scalar_one_or_none()

        if not db_report:
            return None

        # Update report metadata
        if report_data.name is not None:
            db_report.name = report_data.name
        if report_data.description is not None:
            db_report.description = report_data.description
        if report_data.is_public is not None:
            db_report.is_public = report_data.is_public
        if report_data.tags is not None:
            db_report.tags = report_data.tags
        if report_data.layout_config is not None:
            db_report.layout_config = report_data.layout_config
        if report_data.color is not None:
            db_report.color = report_data.color
        if report_data.allowed_departments is not None:
            db_report.allowed_departments = report_data.allowed_departments
        if report_data.allowed_users is not None:
            db_report.allowed_users = report_data.allowed_users
        if report_data.is_direct_link is not None:
            db_report.is_direct_link = report_data.is_direct_link
        if report_data.direct_link is not None:
            db_report.direct_link = report_data.direct_link
        if report_data.db_config is not None:
            db_report.db_config = report_data.db_config
        if report_data.filter_by_department is not None:
            db_report.filter_by_department = report_data.filter_by_department
        if report_data.department_filter_level is not None:
            db_report.department_filter_level = report_data.department_filter_level
        if report_data.filter_by_step_department is not None:
            db_report.filter_by_step_department = report_data.filter_by_step_department

        # Update global filters if provided
        if report_data.global_filters is not None:
            global_filters_json = []
            for filter_data in report_data.global_filters:
                filter_type_value = filter_data.type.value if hasattr(filter_data.type, 'value') else filter_data.type
                global_filters_json.append({
                    'fieldName': filter_data.field_name,
                    'displayName': filter_data.display_name,
                    'type': filter_type_value,
                    'dropdownQuery': filter_data.dropdown_query,
                    'required': filter_data.required,
                    'sqlExpression': filter_data.sql_expression,
                    'dependsOn': filter_data.depends_on
                })
            db_report.global_filters = global_filters_json

        # Determine if report is/will be in direct link mode
        will_be_direct_link = report_data.is_direct_link if report_data.is_direct_link is not None else db_report.is_direct_link
        
        # If switching to or already in direct link mode, delete all queries and tabs
        if will_be_direct_link:
            old_db_query_ids = [q.id for q in db_report.queries]
            if old_db_query_ids:
                # Delete all filters for these queries
                filter_delete_stmt = delete(ReportQueryFilter).where(
                    ReportQueryFilter.query_id.in_(old_db_query_ids)
                )
                await self.db.execute(filter_delete_stmt)
                # Delete all queries for this report
                query_delete_stmt = delete(ReportQuery).where(
                    ReportQuery.report_id == db_report.id
                )
                await self.db.execute(query_delete_stmt)
                # Delete all tabs for this report
                tab_delete_stmt = delete(ReportTab).where(
                    ReportTab.report_id == db_report.id
                )
                await self.db.execute(tab_delete_stmt)
                await self.db.flush()
        
        # Update tabs if provided (only if not a direct link report)
        if report_data.tabs is not None and not will_be_direct_link:
            # Delete all existing tabs and queries
            old_db_query_ids = [q.id for q in db_report.queries]
            if old_db_query_ids:
                # Delete all filters for these queries
                filter_delete_stmt = delete(ReportQueryFilter).where(
                    ReportQueryFilter.query_id.in_(old_db_query_ids)
                )
                await self.db.execute(filter_delete_stmt)

            # Delete all queries and tabs for this report
            query_delete_stmt = delete(ReportQuery).where(
                ReportQuery.report_id == db_report.id
            )
            await self.db.execute(query_delete_stmt)
            
            tab_delete_stmt = delete(ReportTab).where(
                ReportTab.report_id == db_report.id
            )
            await self.db.execute(tab_delete_stmt)
            await self.db.flush()

            # Create new tabs and queries
            for tab_data in report_data.tabs:
                # Track mapping of old query IDs to new query IDs for layout remapping
                old_to_new_query_map = {}
                
                db_tab = ReportTab(
                    report_id=db_report.id,
                    name=tab_data.name,
                    order_index=tab_data.order_index or 0,
                    layout_config=[]  # Will update after creating queries
                )
                self.db.add(db_tab)
                await self.db.flush()  # Get the tab ID

                # Create queries for this tab
                for query_data in tab_data.queries:
                    # Store the incoming ID (from frontend) before creating new query
                    incoming_query_id = str(query_data.id) if query_data.id else None
                    
                    db_query = ReportQuery(
                        report_id=db_report.id,
                        tab_id=db_tab.id,
                        name=query_data.name,
                        sql=query_data.sql,
                        visualization_config=query_data.visualization.dict(),
                        order_index=query_data.order_index or 0
                    )
                    self.db.add(db_query)
                    await self.db.flush()  # Get the query ID
                    
                    # Map incoming ID to new database ID
                    if incoming_query_id:
                        old_to_new_query_map[incoming_query_id] = str(db_query.id)

                    # Create filters for this query
                    for filter_data in query_data.filters:
                        filter_type_value = filter_data.type.value if hasattr(filter_data.type, 'value') else filter_data.type

                        db_filter = ReportQueryFilter(
                            query_id=db_query.id,
                            field_name=filter_data.field_name,
                            display_name=filter_data.display_name,
                            filter_type=filter_type_value,
                            dropdown_query=filter_data.dropdown_query,
                            required=filter_data.required,
                            sql_expression=filter_data.sql_expression,
                            depends_on=filter_data.depends_on
                        )
                        self.db.add(db_filter)
                
                # Update layout_config with new query IDs
                if tab_data.layout_config and old_to_new_query_map:
                    updated_layout = []
                    for layout_item in tab_data.layout_config:
                        if isinstance(layout_item, dict):
                            old_id = str(layout_item.get('i', ''))
                            if old_id in old_to_new_query_map:
                                # Remap the ID to the new query ID
                                layout_item = dict(layout_item)  # Make a copy
                                layout_item['i'] = old_to_new_query_map[old_id]
                            updated_layout.append(layout_item)
                    db_tab.layout_config = updated_layout
                else:
                    db_tab.layout_config = tab_data.layout_config or []
        
        # Update queries if provided (only if not a direct link report and no tabs provided)
        elif report_data.queries is not None and not will_be_direct_link:
            # Store old query IDs from the database
            old_db_query_ids = [q.id for q in db_report.queries]

            if old_db_query_ids:
                # Delete all filters for these queries
                filter_delete_stmt = delete(ReportQueryFilter).where(
                    ReportQueryFilter.query_id.in_(old_db_query_ids)
                )
                await self.db.execute(filter_delete_stmt)

                # Delete all queries for this report
                query_delete_stmt = delete(ReportQuery).where(
                    ReportQuery.report_id == db_report.id
                )
                await self.db.execute(query_delete_stmt)

                await self.db.flush()

            # Create new queries and track incoming-ID-to-new-ID mapping
            # The incoming query IDs are what the frontend uses (and what's in layoutConfig)
            old_to_new_map = {}
            for idx, query_data in enumerate(report_data.queries):
                # Store the incoming ID (from frontend) before creating new query
                incoming_query_id = str(query_data.id) if query_data.id else None

                db_query = ReportQuery(
                    report_id=db_report.id,
                    tab_id=None,
                    name=query_data.name,
                    sql=query_data.sql,
                    visualization_config=query_data.visualization.dict(),
                    order_index=query_data.order_index or 0
                )
                self.db.add(db_query)
                await self.db.flush()  # Get the new query ID from database

                # Map incoming ID (used in layoutConfig) to new database ID
                if incoming_query_id:
                    old_to_new_map[incoming_query_id] = str(db_query.id)

                # Create filters for this query
                for filter_data in query_data.filters:
                    # Handle both enum and string types
                    filter_type_value = filter_data.type.value if hasattr(filter_data.type, 'value') else filter_data.type

                    db_filter = ReportQueryFilter(
                        query_id=db_query.id,
                        field_name=filter_data.field_name,
                        display_name=filter_data.display_name,
                        filter_type=filter_type_value,
                        dropdown_query=filter_data.dropdown_query,
                        required=filter_data.required,
                        sql_expression=filter_data.sql_expression,
                        depends_on=filter_data.depends_on
                    )
                    self.db.add(db_filter)

            # Update layout_config to use new query IDs
            if db_report.layout_config and old_to_new_map:
                # Update layout config with new IDs
                updated_layout = []
                for layout_item in db_report.layout_config:
                    old_id = str(layout_item.get('i', ''))
                    if old_id in old_to_new_map:
                        # Create a new dict to avoid mutating the original
                        new_layout_item = dict(layout_item)
                        new_layout_item['i'] = old_to_new_map[old_id]
                        updated_layout.append(new_layout_item)
                    # If old_id not found in map, skip this layout item (query was removed)

                db_report.layout_config = updated_layout

        await self.db.commit()

        # Refresh and eagerly load relationships
        stmt = select(Report).options(
            selectinload(Report.tabs).selectinload(ReportTab.queries).selectinload(ReportQuery.filters),
            selectinload(Report.queries).selectinload(ReportQuery.filters)
        ).where(Report.id == db_report.id)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def delete_report(self, report_id: int, user: UserSchema) -> bool:
        db_user = await UserService.get_user_by_username(self.db, user.username)
        if not db_user:
            raise ValueError("User not found")

        """Delete a report with all its queries and filters (only if user owns it)"""
        # First, verify the report exists and user owns it
        stmt = select(Report).where(
            and_(Report.id == report_id, Report.owner_id == db_user.id)
        )
        result = await self.db.execute(stmt)
        db_report = result.scalar_one_or_none()

        if not db_report:
            return False


            
        # Soft delete: update deleted_at
        from sqlalchemy import func
        db_report.deleted_at = func.now()
        await self.db.commit()
        return True


    async def toggle_favorite(self, report_id: int, user: UserSchema) -> bool:
        """Toggle favorite status for a report"""
        db_user = await UserService.get_user_by_username(self.db, user.username)
        if not db_user:
            raise ValueError("User not found")

        # Check if report exists
        stmt = select(Report).where(Report.id == report_id)
        result = await self.db.execute(stmt)
        report = result.scalar_one_or_none()

        if not report:
            raise ValueError("Report not found")

        # Check if ReportUser relationship exists
        report_user_stmt = select(ReportUser).where(
            and_(ReportUser.report_id == report_id, ReportUser.user_id == db_user.id)
        )
        report_user_result = await self.db.execute(report_user_stmt)
        report_user = report_user_result.scalar_one_or_none()

        if report_user:
            # Toggle existing favorite status
            report_user.is_favorite = not report_user.is_favorite
            is_favorite = report_user.is_favorite
        else:
            # Create new ReportUser with favorite=True
            report_user = ReportUser(
                report_id=report_id,
                user_id=db_user.id,
                is_favorite=True
            )
            self.db.add(report_user)
            is_favorite = True

        await self.db.commit()
        return is_favorite


    # Query Execution
    def sanitize_sql_query(self, query: str) -> str:
        """Basic SQL injection protection and query sanitization"""
        dangerous_patterns = [
            r'\b(DROP|DELETE|TRUNCATE|INSERT|UPDATE|ALTER|CREATE|GRANT|REVOKE)\b',
            r';[\s]*(?:DROP|DELETE|TRUNCATE|INSERT|UPDATE|ALTER|CREATE|GRANT|REVOKE)',
            r'/\*.*?\*/',  # Multi-line comments
        ]

        sanitized_query = query.strip()

        for pattern in dangerous_patterns:
            if re.search(pattern, sanitized_query, re.IGNORECASE):
                raise ValueError(f"Query contains potentially dangerous SQL: {pattern}")

        # Ensure query starts with SELECT OR WITH
        if not re.match(r'^\s*(SELECT|WITH)\s+', sanitized_query, re.IGNORECASE):
            raise ValueError("Only SELECT OR WITH queries are allowed")

        return sanitized_query

    def apply_filters_to_query(self, sql: str, filters: list[ReportQueryFilter], filter_values: list[FilterValue], db_type: str = "clickhouse") -> str:
        """Apply filter values to a SQL query by replacing {{dynamic_filters}} placeholder

        Args:
            sql: SQL query string
            filters: List of filter configurations
            filter_values: List of filter values to apply
            db_type: Database type ('clickhouse', 'postgresql', 'mssql')
        """
        # Handle empty or None filter_values
        if not filter_values:
            # If no filter values provided, just remove the placeholder
            if "{{dynamic_filters}}" in sql:
                sql = sql.replace("{{dynamic_filters}}", "")
            return sql

        # Create a mapping of field names to values
        filter_map = {fv.field_name: fv for fv in filter_values}

        # Build WHERE conditions. Alias filters must be applied outside the query
        # because SELECT aliases are not visible in WHERE.
        inner_conditions = []
        outer_conditions = []
        aliases = select_aliases(sql)

        for db_filter in filters:
            if db_filter.field_name not in filter_map:
                if db_filter.required:
                    raise ValueError(f"Required filter '{db_filter.display_name}' is missing")
                continue

            filter_value = filter_map[db_filter.field_name]

            if filter_value.value is None or filter_value.value == "":
                continue

            # Use sql_expression if provided, otherwise use field_name
            field_expression = db_filter.sql_expression if db_filter.sql_expression else db_filter.field_name

            # Auto-quote field names that need quoting for PostgreSQL (unless already quoted or using sql_expression)
            if not db_filter.sql_expression:
                if not (field_expression.startswith('"') and field_expression.endswith('"')):
                    # Check if field needs quoting (contains uppercase, spaces, or special chars)
                    if not field_expression.islower() or ' ' in field_expression or not field_expression.replace('_', '').isalnum():
                        field_expression = f'"{field_expression}"'

            value = filter_value.value
            operator = filter_value.operator or "="
            used_ident = _simple_ident(field_expression)
            bucket = outer_conditions if used_ident and used_ident.lower() in aliases else inner_conditions

            if db_filter.filter_type == "text":
                # Check if value is a list (from pasted multiselect)
                if isinstance(value, list):
                    # Treat as IN clause for multiple values
                    quoted_values = [f"'{v}'" for v in value]
                    bucket.append(f"{field_expression} IN ({','.join(quoted_values)})")
                else:
                    # For text filters, use different operators based on the filter condition
                    # Use CAST for quoted identifiers to ensure LOWER works properly
                    field_expr = f"LOWER(CAST({field_expression} AS TEXT))" if field_expression.startswith('"') and field_expression.endswith('"') else f"LOWER({field_expression})"
                    value_expr = f"LOWER('{value}')"

                    if operator == "CONTAINS":
                        bucket.append(f"{field_expr} LIKE LOWER('%{value}%')")
                    elif operator == "NOT_CONTAINS":
                        bucket.append(f"{field_expr} NOT LIKE LOWER('%{value}%')")
                    elif operator == "STARTS_WITH":
                        bucket.append(f"{field_expr} LIKE LOWER('{value}%')")
                    elif operator == "ENDS_WITH":
                        bucket.append(f"{field_expr} LIKE LOWER('%{value}')")
                    elif operator == "=":
                        bucket.append(f"{field_expr} = {value_expr}")
                    elif operator == "NOT_EQUALS":
                        bucket.append(f"{field_expr} != {value_expr}")
                    else:
                        # Default to CONTAINS for backward compatibility
                        bucket.append(f"{field_expr} LIKE LOWER('%{value}%')")
            elif db_filter.filter_type == "number":
                # Check if value is a list (from pasted multiselect)
                if isinstance(value, list):
                    # Treat as IN clause for multiple values
                    bucket.append(f"{field_expression} IN ({','.join(str(v) for v in value)})")
                else:
                    # For number filters, support =, !=, >, <, >=, <=, NOT_EQUALS
                    if operator == "NOT_EQUALS":
                        bucket.append(f"{field_expression} != {value}")
                    elif operator in ["=", "!=", ">", "<", ">=", "<="]:
                        bucket.append(f"{field_expression} {operator} {value}")
                    else:
                        # Default to equals for backward compatibility
                        bucket.append(f"{field_expression} = {value}")
            elif db_filter.filter_type == "date":
                # Use database-specific date functions
                if db_type.lower() == "clickhouse":
                    date_func = "toDate"
                elif db_type.lower() in ["postgresql", "mssql"]:
                    date_func = "DATE"
                else:
                    date_func = "DATE"  # Default to standard SQL

                if operator == "BETWEEN" and isinstance(value, list) and len(value) == 2:
                    # For timestamp fields, we need to compare dates properly
                    condition = f"{date_func}({field_expression}) BETWEEN {date_func}('{value[0]}') AND {date_func}('{value[1]}')"
                    bucket.append(condition)
                elif operator == ">=":
                    condition = f"{date_func}({field_expression}) >= {date_func}('{value}')"
                    bucket.append(condition)
                elif operator == "<=":
                    condition = f"{date_func}({field_expression}) <= {date_func}('{value}')"
                    bucket.append(condition)
                else:
                    condition = f"{date_func}({field_expression}) {operator} {date_func}('{value}')"
                    bucket.append(condition)
            elif db_filter.filter_type in ["dropdown", "multiselect"]:
                if isinstance(value, list) and len(value) > 0:
                    quoted_values = [f"'{v}'" for v in value]
                    bucket.append(f"{field_expression} IN ({','.join(quoted_values)})")
                elif not isinstance(value, list) and value:
                    bucket.append(f"{field_expression} = '{value}'")

        conditions = inner_conditions + outer_conditions
        # Replace {{dynamic_filters}} placeholder with actual filter conditions
        if "{{dynamic_filters}}" in sql:
            if conditions:
                filter_clause = " AND " + " AND ".join(conditions)
                sql = sql.replace("{{dynamic_filters}}", filter_clause)
            else:
                # Remove the placeholder if no filters are applied
                sql = sql.replace("{{dynamic_filters}}", "")
        else:
            if inner_conditions:
                sql = inject_where_condition(sql, " AND ".join(inner_conditions))
            if outer_conditions:
                sql = wrap_query_with_where(sql, " AND ".join(outer_conditions))

        return sql

    def apply_sorting_to_query(self, sql: str, sort_by: str, sort_direction: str) -> str:
        """Apply sorting to SQL query, overriding any existing ORDER BY clause"""
        import re

        # Validate inputs
        if not sort_by or not sort_by.strip():
            raise ValueError("sort_by cannot be empty")

        if not sort_direction or not sort_direction.strip():
            raise ValueError("sort_direction cannot be empty")

        # Validate sort direction
        sort_direction = sort_direction.strip().lower()
        if sort_direction not in ['asc', 'desc']:
            raise ValueError(f"Invalid sort direction: {sort_direction}. Must be 'asc' or 'desc'")

        # Validate sort_by column name (basic SQL injection prevention)
        sort_by = sort_by.strip()

        # Check for dangerous SQL keywords/characters first
        dangerous_chars = [';', '--', '/*', '*/', 'DROP', 'DELETE', 'UPDATE', 'INSERT', 'TRUNCATE']
        sort_by_upper = sort_by.upper()
        for danger in dangerous_chars:
            if danger in sort_by_upper:
                raise ValueError(f"Invalid column name: {sort_by}. Contains potentially dangerous SQL.")

        # Auto-quote field names that need quoting for PostgreSQL (unless already quoted)
        if not (sort_by.startswith('"') and sort_by.endswith('"')):
            # Check if field needs quoting (contains uppercase, spaces, or special chars)
            if not sort_by.islower() or ' ' in sort_by or not sort_by.replace('_', '').replace('.', '').isalnum():
                # Quote the identifier for PostgreSQL
                sort_by = f'"{sort_by}"'

        # Remove existing ORDER BY clause (case insensitive)
        # This regex matches ORDER BY followed by any characters until the end or LIMIT
        sql_without_order = re.sub(r'\s+ORDER\s+BY\s+.*?(?=\s+LIMIT\s+|\s*$)', '', sql, flags=re.IGNORECASE)

        # Add new ORDER BY clause
        new_sql = f"{sql_without_order} ORDER BY {sort_by} {sort_direction.upper()}"

        return new_sql

    async def execute_query(self, query: ReportQuery, filter_values: list[FilterValue] = None, limit: int = 1000, page_size: int = None, page_limit: int = None, sort_by: str = None, sort_direction: str = None, visualization_type: str = None, platform: Platform | None = None, global_filters: list[dict[str, Any]] = None, db_config: dict[str, Any] | None = None, filter_by_department: bool = False, user_department: str | None = None, department_filter_level: str | None = None, filter_by_step_department: bool = False) -> QueryExecutionResult:
        """Execute a single query with optional filters

        Args:
            query: ReportQuery to execute
            filter_values: Optional filter values
            limit: Result limit (default 1000)
            page_size: Page size for pagination
            page_limit: Page number for pagination (1-based)
            sort_by: Column to sort by
            sort_direction: Sort direction ('asc' or 'desc')
            visualization_type: Type of visualization
            platform: Platform instance for database connection (optional, falls back to clickhouse_client)
            global_filters: Global filters from the report that apply to all queries
            db_config: Database configuration from report (overrides platform db_config)
            filter_by_department: If True, automatically filter results by user's department
            user_department: User's department for automatic filtering
            department_filter_level: Department hierarchy level to filter by ('sektor', 'direktorluk', 'mudurluk', 'birim', or None for full)
            filter_by_step_department: If True, filter by step_department column instead of department column
        """
        t0 = time.time()
        print(f"\n[PERF] Starting execute_query for query_id={query.id}")

        # Determine database type - prioritize report's db_config
        t1 = time.time()
        if db_config:
            db_type = db_config.get('db_type', 'clickhouse').lower()
        elif platform:
            db_type = platform.db_type.lower()
        else:
            # Fallback to ClickHouse for backward compatibility
            db_type = "clickhouse"
            if not self.clickhouse_client:
                raise ValueError("Database client not available")
        print(f"[PERF] DB type determination: {(time.time() - t1) * 1000:.2f}ms")

        try:
            # Get the base SQL
            t1 = time.time()
            sql = query.sql
            print(f"[PERF] Get base SQL: {(time.time() - t1) * 1000:.2f}ms")

            # Merge global filters with query-specific filters
            t1 = time.time()
            all_filters = list(query.filters)
            if global_filters:
                # Convert global filters dict to ReportQueryFilter objects for processing
                for gf in global_filters:
                    # Create a pseudo-filter object that matches ReportQueryFilter structure
                    filter_obj = type('obj', (object,), {
                        'field_name': gf.get('fieldName'),
                        'display_name': gf.get('displayName'),
                        'filter_type': gf.get('type'),
                        'dropdown_query': gf.get('dropdownQuery'),
                        'required': gf.get('required', False),
                        'sql_expression': gf.get('sqlExpression'),
                        'depends_on': gf.get('dependsOn')
                    })()
                    all_filters.append(filter_obj)
            print(f"[PERF] Merge global filters: {(time.time() - t1) * 1000:.2f}ms")

            # Always apply filters (even if empty) to handle {{dynamic_filters}} placeholder
            t1 = time.time()
            sql = self.apply_filters_to_query(sql, all_filters, filter_values or [], db_type)
            print(f"[PERF] Apply filters: {(time.time() - t1) * 1000:.2f}ms")

            # Apply department filtering if enabled
            t1 = time.time()
            if filter_by_department and user_department:
                # Determine which column to filter by
                column_name = "step_department" if filter_by_step_department else "department"
                
                # Inject department filter into the query based on the selected hierarchy level
                # Department structure: A_B_C_D_E where:
                # - A is root
                # - B is Sektör (sector)
                # - C is Direktörlük (directorate)
                # - D is Müdürlük (department)
                # - E is Birim (unit)
                
                dept_parts = user_department.split('_')
                
                # Determine which department level to filter by
                if department_filter_level:
                    # Map level names to position in hierarchy (0-indexed)
                    level_map = {
                        'sektor': 2,        # A_B (up to position 2)
                        'direktorluk': 3,   # A_B_C (up to position 3)
                        'mudurluk': 4,      # A_B_C_D (up to position 4)
                        'birim': 5          # A_B_C_D_E (up to position 5, or full)
                    }
                    
                    level_position = level_map.get(department_filter_level.lower())
                    
                    if level_position and len(dept_parts) >= level_position:
                        # Get the department up to the specified level
                        filtered_dept = '_'.join(dept_parts[:level_position])
                    else:
                        # If level not recognized or user doesn't have that level, use full department
                        filtered_dept = user_department
                else:
                    # No level specified, use full user department hierarchy
                    # Build list of all parent departments for flexible matching
                    dept_hierarchy = []
                    current = ""
                    for part in dept_parts:
                        current = f"{current}_{part}" if current else part
                        dept_hierarchy.append(current)
                    filtered_dept = None  # Will use hierarchy list instead
                
                # Create SQL condition - uses the selected column name (department or step_department)
                if filtered_dept:
                    # Single level filtering - match column that starts with the specified level
                    if db_type.lower() in ["postgresql", "mssql"]:
                        dept_filter_clause = f"{column_name} LIKE '{filtered_dept}%'"
                    else:
                        # ClickHouse uses LIKE
                        dept_filter_clause = f"{column_name} LIKE '{filtered_dept}%'"
                else:
                    # Full hierarchy filtering - match any parent level
                    dept_conditions = []
                    for dept in dept_hierarchy:
                        if db_type.lower() in ["postgresql", "mssql"]:
                            dept_conditions.append(f"{column_name} LIKE '{dept}%'")
                        else:
                            dept_conditions.append(f"{column_name} LIKE '{dept}%'")
                    dept_filter_clause = " OR ".join(dept_conditions)
                
                sql = inject_where_condition(sql, dept_filter_clause)
            print(f"[PERF] Apply department filter: {(time.time() - t1) * 1000:.2f}ms")

            # Apply sorting if provided
            t1 = time.time()
            if sort_by and sort_direction:
                try:
                    sql = self.apply_sorting_to_query(sql, sort_by, sort_direction)
                except ValueError as e:
                    return QueryExecutionResult(
                        query_id=query.id,
                        query_name=query.name,
                        columns=[],
                        data=[],
                        total_rows=0,
                        execution_time_ms=0,
                        success=False,
                        message=f"Sorting error: {e!s}"
                    )
            print(f"[PERF] Apply sorting: {(time.time() - t1) * 1000:.2f}ms")

            # Sanitize the query
            t1 = time.time()
            sanitized_sql = self.sanitize_sql_query(sql)
            print(f"[PERF] Sanitize SQL: {(time.time() - t1) * 1000:.2f}ms")

            start_time = time.time()
            total_rows = 0

            # Execute based on database type
            if db_type == "clickhouse":
                # Use ClickHouse client (existing logic)
                if not self.clickhouse_client:
                    raise ValueError("ClickHouse client not available")

                # Handle pagination if both page_size and page_limit are provided
                if page_size is not None and page_limit is not None:
                    # First, get the total count for pagination info
                    t1 = time.time()
                    count_sql = f"SELECT COUNT(*) FROM ({sanitized_sql}) AS subquery"
                    # Run blocking operation in thread pool to not block event loop
                    count_result = await asyncio.to_thread(self.clickhouse_client.execute, count_sql)
                    total_rows = count_result[0][0] if count_result and count_result[0] else 0
                    print(f"[PERF] ClickHouse count query: {(time.time() - t1) * 1000:.2f}ms")

                    # Calculate offset (page_limit is 1-based)
                    offset = (page_limit - 1) * page_size

                    # Add pagination to the main query
                    t1 = time.time()
                    paginated_sql = f"{sanitized_sql} LIMIT {page_size} OFFSET {offset}"
                    # Run blocking operation in thread pool to not block event loop
                    result = await asyncio.to_thread(self.clickhouse_client.execute, paginated_sql, with_column_types=True)
                    print(f"[PERF] ClickHouse paginated query: {(time.time() - t1) * 1000:.2f}ms")
                else:
                    # Add limit only for table visualizations (non-paginated query)
                    if visualization_type == 'table' and 'LIMIT' not in sanitized_sql.upper():
                        sanitized_sql = f"{sanitized_sql} LIMIT {limit}"

                    # Execute the query
                    t1 = time.time()
                    # Run blocking operation in thread pool to not block event loop
                    result = await asyncio.to_thread(self.clickhouse_client.execute, sanitized_sql, with_column_types=True)
                    print(f"[PERF] ClickHouse execute query: {(time.time() - t1) * 1000:.2f}ms")

                # Process ClickHouse results
                t1 = time.time()
                if result and len(result) > 0:
                    columns = [col[0] for col in result[1]] if len(result) > 1 else []
                    data = result[0] if result[0] else []
                else:
                    columns = []
                    data = []
                print(f"[PERF] Process ClickHouse results: {(time.time() - t1) * 1000:.2f}ms")

            elif db_type == "postgresql":
                # Use PostgreSQL connection - prioritize report's db_config
                t1 = time.time()
                if db_config:
                    # Use report's db_config with connection pool
                    conn = await asyncio.to_thread(self._connection_pool.get_connection, db_config=db_config, db_type=db_type)
                elif platform:
                    # Fallback to platform's connection pool
                    conn = await asyncio.to_thread(self._connection_pool.get_connection, platform=platform, db_type=db_type)
                else:
                    raise ValueError("Database configuration required for PostgreSQL queries")
                cursor = conn.cursor()
                print(f"[PERF] PostgreSQL get connection: {(time.time() - t1) * 1000:.2f}ms")

                try:
                    # Handle pagination if both page_size and page_limit are provided
                    if page_size is not None and page_limit is not None:
                        # Calculate offset (page_limit is 1-based)
                        offset = (page_limit - 1) * page_size

                        # Fetch page_size + 1 rows to check if there are more pages (no COUNT needed)
                        t1 = time.time()
                        paginated_sql = f"{sanitized_sql} LIMIT {page_size + 1} OFFSET {offset}"
                        # Run blocking operation in thread pool
                        await asyncio.to_thread(cursor.execute, paginated_sql)
                        print(f"[PERF] PostgreSQL paginated query: {(time.time() - t1) * 1000:.2f}ms")
                    else:
                        # Add limit only for table visualizations (non-paginated query)
                        if visualization_type == 'table' and 'LIMIT' not in sanitized_sql.upper():
                            sanitized_sql = f"{sanitized_sql} LIMIT {limit}"

                        # Execute the query
                        t1 = time.time()
                        # Run blocking operation in thread pool
                        await asyncio.to_thread(cursor.execute, sanitized_sql)
                        print(f"[PERF] PostgreSQL execute query: {(time.time() - t1) * 1000:.2f}ms")

                    # Get columns and data
                    t1 = time.time()
                    columns = [desc[0] for desc in cursor.description] if cursor.description else []
                    data = await asyncio.to_thread(cursor.fetchall)
                    print(f"[PERF] PostgreSQL fetch results: {(time.time() - t1) * 1000:.2f}ms")

                finally:
                    cursor.close()
                    # Return connection to pool
                    await asyncio.to_thread(self._connection_pool.return_connection, conn, db_config=db_config, platform=platform, db_type=db_type)

            elif db_type == "mssql":
                # Use MSSQL connection - prioritize report's db_config
                if db_config:
                    # Use report's db_config with connection pool
                    conn = await asyncio.to_thread(self._connection_pool.get_connection, db_config=db_config, db_type=db_type)
                elif platform:
                    # Fallback to platform's connection pool
                    conn = await asyncio.to_thread(self._connection_pool.get_connection, platform=platform, db_type=db_type)
                else:
                    raise ValueError("Database configuration required for MSSQL queries")
                cursor = conn.cursor()

                try:
                    # Handle pagination if both page_size and page_limit are provided
                    if page_size is not None and page_limit is not None:
                        # Calculate offset (page_limit is 1-based)
                        offset = (page_limit - 1) * page_size

                        # Fetch page_size + 1 rows to check if there are more pages (no COUNT needed)
                        # MSSQL uses OFFSET/FETCH syntax
                        paginated_sql = f"{sanitized_sql} OFFSET {offset} ROWS FETCH NEXT {page_size + 1} ROWS ONLY"
                        # Run blocking operation in thread pool
                        await asyncio.to_thread(cursor.execute, paginated_sql)
                    else:
                        # Add TOP for table visualizations (non-paginated query)
                        if visualization_type == 'table' and 'TOP' not in sanitized_sql.upper() and 'LIMIT' not in sanitized_sql.upper():
                            # MSSQL uses TOP instead of LIMIT
                            sanitized_sql = sanitized_sql.replace("SELECT", f"SELECT TOP {limit}", 1)

                        # Execute the query
                        # Run blocking operation in thread pool
                        await asyncio.to_thread(cursor.execute, sanitized_sql)

                    # Get columns and data
                    columns = [column[0] for column in cursor.description] if cursor.description else []
                    data = await asyncio.to_thread(cursor.fetchall)

                finally:
                    cursor.close()
                    # Return connection to pool
                    await asyncio.to_thread(self._connection_pool.return_connection, conn, db_config=db_config, platform=platform, db_type=db_type)
            else:
                raise ValueError(f"Unsupported database type: {db_type}")

            execution_time_ms = (time.time() - start_time) * 1000
            print(f"[PERF] Total DB execution time: {execution_time_ms:.2f}ms")

            # Format data for JSON serialization (common for all database types)
            t1 = time.time()
            formatted_data = []
            has_more = False

            # If paginated, check if we got more rows than page_size
            if page_size is not None and page_limit is not None:
                has_more = len(data) > page_size
                # Remove the extra row used for has_more check
                data_to_format = data[:page_size]
            else:
                data_to_format = data

            for row in data_to_format:
                formatted_row = []
                for item in row:
                    if isinstance(item, (int, float, str, bool)) or item is None:
                        formatted_row.append(item)
                    else:
                        # Handle datetime, date, and other types
                        formatted_row.append(str(item))
                formatted_data.append(formatted_row)
            print(f"[PERF] Format data for JSON: {(time.time() - t1) * 1000:.2f}ms")

            # For paginated queries, we don't know exact total (no COUNT), just whether there are more pages
            # For non-paginated queries, use data length
            actual_total_rows = len(formatted_data)

            print(f"[PERF] TOTAL execute_query time: {(time.time() - t0) * 1000:.2f}ms\n")

            return QueryExecutionResult(
                query_id=query.id,
                query_name=query.name,
                columns=columns,
                data=formatted_data,
                total_rows=actual_total_rows,
                execution_time_ms=round(execution_time_ms, 2),
                success=True,
                message=f"Query executed successfully. Retrieved {len(formatted_data)} rows{f' of {actual_total_rows} total' if actual_total_rows > len(formatted_data) else ''}.",
                has_more=has_more
            )

        except Exception as e:
            error_msg = str(e)
            if "Code:" in error_msg:
                error_msg = error_msg.split("Code:")[1].strip()

            return QueryExecutionResult(
                query_id=query.id,
                query_name=query.name,
                columns=[],
                data=[],
                total_rows=0,
                execution_time_ms=0,
                success=False,
                message=f"Query execution failed: {error_msg}"
            )

    async def execute_report(self, request: ReportExecutionRequest, user: UserSchema) -> ReportExecutionResponse:
        t0 = time.time()
        print(f"\n[PERF] Starting execute_report for report_id={request.report_id}")
        db_user = await UserService.get_user_by_username(self.db, user.username)
        if not db_user:
            raise ValueError("User not found")
        print(f"[PERF] Get user: {(time.time() - t0) * 1000:.2f}ms")

        """Execute a full report or specific query"""
        # Get the report with platform relationship
        # Use joinedload for better performance - single query with JOINs instead of multiple queries
        stmt = select(Report).options(
            joinedload(Report.queries).joinedload(ReportQuery.filters),
            joinedload(Report.platform)
        ).where(Report.id == request.report_id)
        t2 = time.time()
        result = await self.db.execute(stmt)
        print(f"[PERF] Fetch report with joinedload: {(time.time() - t2) * 1000:.2f}ms")
        report = result.unique().scalar_one_or_none()

        if not report:
            raise ValueError("Report not found or access denied")

        is_admin = user.role and "miras:admin" in user.role
        if is_admin:
            has_access = True
        else:
            has_access = (
                report.owner_id == db_user.id or 
                report.is_public == True
            )
        
        if not has_access:
            # Check allowed users
            if report.allowed_users and user.username in report.allowed_users:
                has_access = True
            
            # Check allowed departments
            if not has_access and report.allowed_departments and user.department:
                # Check if user's department or any of its parents are in allowed_departments
                user_dept_parts = user.department.split('_')
                current_dept = ""
                for part in user_dept_parts:
                    current_dept = f"{current_dept}_{part}" if current_dept else part
                    if current_dept in report.allowed_departments:
                        has_access = True
                        break

        if not has_access:
            raise ValueError("Report access denied")

        # Get platform for database connection (used as fallback)
        platform = report.platform
        
        # Get report's db_config (prioritized over platform's config)
        report_db_config = report.db_config

        # Verify we have a way to execute queries (report db_config, platform, or clickhouse_client)
        if not report_db_config and not platform and not self.clickhouse_client:
            raise ValueError("No database connection available for this report")

        # Merge global filters with request filters
        # Global filters apply to all queries, request filters are user-provided values
        merged_filters = list(request.filters) if request.filters else []

        # If report has global filters defined, they should already be part of the SQL
        # The filter values in the request will apply to both global and query-specific filters

        start_time = time.time()
        results = []

        try:
            if request.query_id:
                # Execute specific query
                query = next((q for q in report.queries if q.id == request.query_id), None)
                if not query:
                    raise ValueError("Query not found in report")

                result = await self.execute_query(
                    query, merged_filters, request.limit,
                    request.page_size, request.page_limit,
                    request.sort_by, request.sort_direction,
                    query.visualization_config.get('type', 'table'),
                    platform=platform,
                    global_filters=report.global_filters or [],
                    db_config=report_db_config,
                    filter_by_department=report.filter_by_department or False,
                    user_department=user.department,
                    department_filter_level=report.department_filter_level,
                    filter_by_step_department=report.filter_by_step_department or False
                )
                results.append(result)
            else:
                # Execute all queries in parallel for better performance
                tasks = []
                for query in report.queries:
                    task = self.execute_query(
                        query, merged_filters, request.limit,
                        request.page_size, request.page_limit,
                        request.sort_by, request.sort_direction,
                        query.visualization_config.get('type', 'table'),
                        platform=platform,
                        global_filters=report.global_filters or [],
                        db_config=report_db_config,
                        filter_by_department=report.filter_by_department or False,
                        user_department=user.department,
                        department_filter_level=report.department_filter_level,
                        filter_by_step_department=report.filter_by_step_department or False
                    )
                    tasks.append(task)
                
                # Execute all queries concurrently
                results = await asyncio.gather(*tasks)

            total_execution_time = (time.time() - start_time) * 1000
            print(f"[PERF] Total execute_report time: {(time.time() - t0) * 1000:.2f}ms\n")

            return ReportExecutionResponse(
                report_id=report.id,
                report_name=report.name,
                results=results,
                total_execution_time_ms=round(total_execution_time, 2),
                success=all(r.success for r in results),
                message="Report executed successfully" if all(r.success for r in results) else "Some queries failed"
            )

        except Exception as e:
            total_execution_time = (time.time() - start_time) * 1000

            return ReportExecutionResponse(
                report_id=request.report_id,
                report_name=report.name if report else "Unknown",
                results=results,
                total_execution_time_ms=round(total_execution_time, 2),
                success=False,
                message=str(e)
            )

    async def get_filter_options(self, report_id: int, query_id: int, filter_field: str, user: UserSchema, page: int = 1, page_size: int = 50, search: str = "") -> dict[str, Any]:
        db_user = await UserService.get_user_by_username(self.db, user.username)
        if not db_user:
            raise ValueError("User not found")

        """Get dropdown options for a filter by report, query, and field name with pagination and search"""
        # Get the filter along with report and platform
        stmt = select(ReportQueryFilter).join(ReportQuery).join(Report).options(
            selectinload(ReportQueryFilter.query).selectinload(ReportQuery.report).selectinload(Report.platform)
        ).where(
            and_(
                Report.id == report_id,
                ReportQuery.id == query_id,
                ReportQueryFilter.field_name == filter_field
            )
        )
        result = await self.db.execute(stmt)
        db_filter = result.scalar_one_or_none()
        
        if not db_filter:
            return {"options": [], "total": 0, "page": page, "page_size": page_size, "has_more": False}
            
        

        if not db_filter.dropdown_query:
            return {"options": [], "total": 0, "page": page, "page_size": page_size, "has_more": False}

        # Get report's db_config and platform (fallback)
        report_db_config = db_filter.query.report.db_config if db_filter.query and db_filter.query.report else None
        platform = db_filter.query.report.platform if db_filter.query and db_filter.query.report else None

        # Determine database type - prioritize report's db_config
        if report_db_config:
            db_type = report_db_config.get('db_type', 'clickhouse').lower()
        elif platform:
            db_type = platform.db_type.lower()
        else:
            db_type = "clickhouse"
            if not self.clickhouse_client:
                raise ValueError("Database client not available")

        try:
            # Build the query with search and pagination
            base_query = self.sanitize_sql_query(db_filter.dropdown_query)

            # Remove trailing semicolon if present
            base_query = base_query.rstrip(';').strip()

            # Add search filter if provided
            if search:
                # Wrap base query and add WHERE clause for search
                # This assumes the first column is value and second is label
                if "WHERE" in base_query.upper():
                    base_query = f"SELECT * FROM ({base_query}) AS subquery WHERE CAST(subquery.value AS TEXT) ILIKE '%{search}%' OR CAST(subquery.label AS TEXT) ILIKE '%{search}%'"
                else:
                    # If no columns specified, search in all columns
                    base_query = f"SELECT * FROM ({base_query}) AS subquery WHERE CAST(subquery.value AS TEXT) ILIKE '%{search}%'"

            # Get total count
            count_query = f"SELECT COUNT(*) FROM ({base_query}) AS count_subquery"

            # Add pagination
            offset = (page - 1) * page_size
            paginated_query = f"{base_query} LIMIT {page_size} OFFSET {offset}"

            if db_type == "clickhouse":
                if not self.clickhouse_client:
                    raise ValueError("ClickHouse client not available")

                # Get total count (run in thread pool to not block event loop)
                total_result = await asyncio.to_thread(self.clickhouse_client.execute, count_query)
                total = total_result[0][0] if total_result else 0

                # Get paginated results (run in thread pool to not block event loop)
                result = await asyncio.to_thread(self.clickhouse_client.execute, paginated_query)

            elif db_type == "postgresql":
                # Use report's db_config or fallback to platform
                if report_db_config:
                    conn = await asyncio.to_thread(self._connection_pool.get_connection, db_config=report_db_config, db_type=db_type)
                elif platform:
                    conn = await asyncio.to_thread(self._connection_pool.get_connection, platform=platform, db_type=db_type)
                else:
                    raise ValueError("Database configuration required for PostgreSQL queries")
                
                cursor = conn.cursor()
                try:
                    # Get total count (run in thread pool)
                    await asyncio.to_thread(cursor.execute, count_query)
                    total = cursor.fetchone()[0]

                    # Get paginated results (run in thread pool)
                    await asyncio.to_thread(cursor.execute, paginated_query)
                    result = await asyncio.to_thread(cursor.fetchall)
                finally:
                    cursor.close()
                    # Return connection to pool
                    await asyncio.to_thread(self._connection_pool.return_connection, conn, db_config=report_db_config, platform=platform, db_type=db_type)

            elif db_type == "mssql":
                # Use report's db_config or fallback to platform
                if report_db_config:
                    conn = await asyncio.to_thread(self._connection_pool.get_connection, db_config=report_db_config, db_type=db_type)
                elif platform:
                    conn = await asyncio.to_thread(self._connection_pool.get_connection, platform=platform, db_type=db_type)
                else:
                    raise ValueError("Database configuration required for MSSQL queries")
                
                cursor = conn.cursor()
                try:
                    # Get total count (run in thread pool)
                    await asyncio.to_thread(cursor.execute, count_query)
                    total = cursor.fetchone()[0]

                    # Get paginated results (run in thread pool)
                    await asyncio.to_thread(cursor.execute, paginated_query)
                    result = await asyncio.to_thread(cursor.fetchall)
                finally:
                    cursor.close()
                    # Return connection to pool
                    await asyncio.to_thread(self._connection_pool.return_connection, conn, db_config=report_db_config, platform=platform, db_type=db_type)
            else:
                raise ValueError(f"Unsupported database type: {db_type}")

            # Format as value/label pairs
            options = []
            for row in result:
                if len(row) >= 2:
                    options.append({"value": row[0], "label": row[1]})
                elif len(row) == 1:
                    options.append({"value": row[0], "label": str(row[0])})

            has_more = (offset + len(options)) < total

            return {
                "options": options,
                "total": total,
                "page": page,
                "page_size": page_size,
                "has_more": has_more
            }

        except Exception as e:
            raise ValueError(f"Failed to get filter options: {e!s}")

    EXCEL_MAX_DATA_ROWS = 1_048_575
    EXPORT_FETCH_SIZE = 10_000
    EXPORT_COPY_BATCH_SIZE = 20_000

    async def get_authorized_report(self, report_id: int, user: UserSchema) -> Report:
        db_user = await UserService.get_user_by_username(self.db, user.username)
        if not db_user:
            raise ValueError("User not found")

        stmt = select(Report).options(
            joinedload(Report.queries).joinedload(ReportQuery.filters),
            joinedload(Report.platform)
        ).where(Report.id == report_id)
        result = await self.db.execute(stmt)
        report = result.unique().scalar_one_or_none()
        if not report:
            raise ValueError("Report not found or access denied")

        is_admin = user.role and "miras:admin" in user.role
        has_access = bool(is_admin) or report.owner_id == db_user.id or report.is_public is True
        if not has_access and report.allowed_users and user.username in report.allowed_users:
            has_access = True
        if not has_access and report.allowed_departments and user.department:
            user_dept_parts = user.department.split('_')
            current_dept = ""
            for part in user_dept_parts:
                current_dept = f"{current_dept}_{part}" if current_dept else part
                if current_dept in report.allowed_departments:
                    has_access = True
                    break
        if not has_access:
            raise ValueError("Report access denied")
        return report

    def _prepare_export_sql(
        self,
        query: ReportQuery,
        filter_values: list[FilterValue] | None,
        sort_by: str | None,
        sort_direction: str | None,
        db_type: str,
        global_filters: list[dict[str, Any]] | None,
        filter_by_department: bool,
        user_department: str | None,
        department_filter_level: str | None,
        filter_by_step_department: bool,
    ) -> str:
        sql = query.sql
        all_filters = list(query.filters)
        if global_filters:
            for gf in global_filters:
                filter_obj = type('obj', (object,), {
                    'field_name': gf.get('fieldName'),
                    'display_name': gf.get('displayName'),
                    'filter_type': gf.get('type'),
                    'dropdown_query': gf.get('dropdownQuery'),
                    'required': gf.get('required', False),
                    'sql_expression': gf.get('sqlExpression'),
                    'depends_on': gf.get('dependsOn')
                })()
                all_filters.append(filter_obj)

        sql = self.apply_filters_to_query(sql, all_filters, filter_values or [], db_type)

        if filter_by_department and user_department:
            column_name = "step_department" if filter_by_step_department else "department"
            dept_parts = user_department.split('_')
            if department_filter_level:
                level_map = {'sektor': 2, 'direktorluk': 3, 'mudurluk': 4, 'birim': 5}
                level_position = level_map.get(department_filter_level.lower())
                if level_position and len(dept_parts) >= level_position:
                    filtered_dept = '_'.join(dept_parts[:level_position])
                else:
                    filtered_dept = user_department
                dept_filter_clause = f"{column_name} LIKE '{filtered_dept}%'"
            else:
                dept_conditions = []
                current = ""
                for part in dept_parts:
                    current = f"{current}_{part}" if current else part
                    dept_conditions.append(f"{column_name} LIKE '{current}%'")
                dept_filter_clause = " OR ".join(dept_conditions)

            sql = inject_where_condition(sql, dept_filter_clause)

        if sort_by and sort_direction:
            sql = self.apply_sorting_to_query(sql, sort_by, sort_direction)
        return self.sanitize_sql_query(sql)

    @staticmethod
    def _format_export_value(value: Any) -> Any:
        if value is None or isinstance(value, (int, float, bool, str)):
            return value
        if isinstance(value, Decimal):
            return float(value)
        if isinstance(value, (datetime, date, dt_time, UUID)):
            return str(value)
        if isinstance(value, bytes):
            return value.decode("utf-8", errors="replace")
        return str(value)

    def _fetch_export_table(
        self,
        sql: str,
        db_type: str,
        db_config: dict[str, Any] | None,
        platform: Platform | None,
    ) -> tuple[list[str], list[list[Any]]]:
        columns: list[str] = []
        data: list[list[Any]] = []
        for batch_columns, batch in self._iter_export_batches(sql, db_type, db_config, platform):
            if not columns:
                columns = list(batch_columns or [])
            for row in batch or []:
                data.append([self._format_export_value(value) for value in row])
        return columns, data

    def _expand_nested_export_table(
        self,
        parent_columns: list[str],
        parent_data: list[list[Any]],
        nested_queries: list[dict[str, Any]],
        db_type: str,
        db_config: dict[str, Any] | None,
        platform: Platform | None,
    ) -> tuple[list[str], list[list[Any]]]:
        cache: dict[str, tuple[list[str], list[list[Any]]]] = {}
        cache_lock = Lock()
        clickhouse_lock = Lock()

        def fetch_sql(sql: str) -> tuple[list[str], list[list[Any]]]:
            with cache_lock:
                cached = cache.get(sql)
            if cached is not None:
                return cached
            try:
                sanitized = self.sanitize_sql_query(sql)
                if db_type == "clickhouse":
                    with clickhouse_lock:
                        with cache_lock:
                            cached = cache.get(sql)
                            if cached is not None:
                                return cached
                        result = self._fetch_export_table(sanitized, db_type, db_config, platform)
                else:
                    result = self._fetch_export_table(sanitized, db_type, db_config, platform)
            except Exception as exc:
                print(f"[EXPORT] Nested query failed during Excel export: {exc}")
                result = ([], [])
            with cache_lock:
                cache[sql] = result
            return result

        concurrency = 1 if db_type == "clickhouse" else NESTED_EXPORT_CONCURRENCY
        return flatten_nested_export(
            parent_columns,
            parent_data,
            nested_queries,
            fetch_sql,
            1,
            concurrency,
        )

    @staticmethod
    def _excel_sheet_name(name: str, used: set[str]) -> str:
        base = re.sub(r'[\\/?*\[\]:]', '_', name or 'Sheet')[:31].strip() or 'Sheet'
        candidate = base
        suffix = 2
        while candidate.lower() in used:
            extra = f"_{suffix}"
            candidate = f"{base[:max(1, 31 - len(extra))]}{extra}"
            suffix += 1
        used.add(candidate.lower())
        return candidate

    def _iter_export_batches(
        self,
        sql: str,
        db_type: str,
        db_config: dict[str, Any] | None,
        platform: Platform | None,
    ):
        fetch_size = self.EXPORT_FETCH_SIZE
        if db_type == "clickhouse":
            if db_config:
                client = self._connection_pool.get_connection(db_config=db_config, db_type=db_type)
            elif self.clickhouse_client:
                client = self.clickhouse_client
            else:
                raise ValueError("ClickHouse client not available")
            empty = client.execute(f"SELECT * FROM ({sql}) AS _export_src LIMIT 0", with_column_types=True)
            columns = [col[0] for col in empty[1]] if empty and len(empty) > 1 else []
            batch: list[Any] = []
            for row in client.execute_iter(sql, settings={"max_block_size": fetch_size}):
                batch.append(row)
                if len(batch) >= fetch_size:
                    yield columns, batch
                    batch = []
            yield columns, batch
            return

        if db_type == "postgresql":
            yield from self._iter_postgres_export_batches(sql, db_config, platform)
            return

        if db_type == "mssql":
            conn = self._connection_pool.get_connection(db_config=db_config, platform=platform, db_type=db_type)
            cursor = conn.cursor()
            try:
                cursor.arraysize = fetch_size
                cursor.execute(sql)
                columns = [column[0] for column in cursor.description] if cursor.description else []
                while True:
                    rows = cursor.fetchmany(fetch_size)
                    if not rows:
                        if not columns:
                            yield columns, []
                        break
                    yield columns, rows
            finally:
                cursor.close()
                self._connection_pool.return_connection(conn, db_config=db_config, platform=platform, db_type=db_type)
            return

        raise ValueError(f"Unsupported database type: {db_type}")

    def _copy_postgres_query(
        self,
        sql: str,
        db_config: dict[str, Any] | None,
        platform: Platform | None,
        on_header: Callable[[list[str]], None],
        on_batch: Callable[[list[list[str]]], None],
    ) -> None:
        conn = self._connection_pool.get_connection(db_config=db_config, platform=platform, db_type="postgresql")
        cursor = None
        try:
            try:
                conn.rollback()
            except Exception:
                pass
            cursor = conn.cursor()
            stripped_sql = sql.strip().rstrip(";")
            copy_sql = f"COPY ({stripped_sql}) TO STDOUT WITH CSV HEADER"
            sink = _CsvCopySink(on_header, on_batch, self.EXPORT_COPY_BATCH_SIZE)
            cursor.copy_expert(copy_sql, sink)
            sink.flush()
        finally:
            if cursor is not None:
                try:
                    cursor.close()
                except Exception:
                    pass
            try:
                conn.rollback()
            except Exception:
                pass
            self._connection_pool.return_connection(
                conn, db_config=db_config, platform=platform, db_type="postgresql"
            )

    def _iter_postgres_export_batches(
        self,
        sql: str,
        db_config: dict[str, Any] | None,
        platform: Platform | None,
    ):
        fetch_size = self.EXPORT_FETCH_SIZE
        conn = self._connection_pool.get_connection(db_config=db_config, platform=platform, db_type="postgresql")
        cursor = None
        try:
            conn.autocommit = False
            cursor = conn.cursor(name=f"export_{int(time.time() * 1000)}")
            cursor.itersize = fetch_size
            cursor.execute(sql)
            columns: list[str] = []
            while True:
                rows = cursor.fetchmany(fetch_size)
                if not columns and cursor.description:
                    columns = [desc[0] for desc in cursor.description]
                if not rows:
                    if not columns:
                        yield [], []
                    break
                yield columns, rows
        finally:
            if cursor is not None:
                try:
                    cursor.close()
                except Exception:
                    pass
            try:
                conn.rollback()
            except Exception:
                pass
            self._connection_pool.return_connection(conn, db_config=db_config, platform=platform, db_type="postgresql")

    def _write_excel_from_queries(
        self,
        query_specs: list[dict[str, Any]],
        progress_cb: Callable[[int, str, int], None],
    ) -> str:
        from openpyxl import Workbook

        workbook = Workbook(write_only=True)
        used_names: set[str] = set()
        total_rows = 0
        estimated_total = 50_000
        query_count = max(len(query_specs), 1)

        for query_index, spec in enumerate(query_specs):
            query_name = spec["name"]
            progress_cb(
                max(1, int(query_index / query_count * 90)),
                f"{query_name} sorgulanıyor...",
                total_rows,
            )
            columns: list[str] | None = None
            sheet = None
            sheet_rows = 0
            sheet_number = 1

            def start_sheet():
                nonlocal sheet, sheet_rows, sheet_number
                suffix = "" if sheet_number == 1 else f" ({sheet_number})"
                sheet = workbook.create_sheet(self._excel_sheet_name(f"{query_name}{suffix}", used_names))
                if columns:
                    sheet.append(columns)
                sheet_rows = 0

            def report_progress():
                nonlocal estimated_total
                if total_rows > estimated_total * 0.75:
                    estimated_total = int(total_rows / 0.65)
                query_start = int(query_index / query_count * 90)
                query_span = 90 / query_count
                fraction = min(0.98, total_rows / max(estimated_total, 1))
                percent = min(95, int(query_start + fraction * query_span))
                progress_cb(
                    percent,
                    f"{query_name} — {total_rows:,} satır".replace(",", "."),
                    total_rows,
                )

            nested_queries = spec.get("nested_queries") or []
            if nested_queries:
                progress_cb(
                    max(1, int(query_index / query_count * 90)),
                    f"{query_name} — iç tablolar genişletiliyor...",
                    total_rows,
                )
                parent_columns, parent_data = self._fetch_export_table(
                    spec["sql"], spec["db_type"], spec["db_config"], spec["platform"]
                )
                columns, expanded_rows = self._expand_nested_export_table(
                    parent_columns,
                    parent_data,
                    nested_queries,
                    spec["db_type"],
                    spec["db_config"],
                    spec["platform"],
                )
                if sheet is None:
                    start_sheet()
                for row in expanded_rows:
                    if sheet_rows >= self.EXCEL_MAX_DATA_ROWS:
                        sheet_number += 1
                        start_sheet()
                    sheet.append(row)
                    sheet_rows += 1
                    total_rows += 1
                    if total_rows % 500 == 0:
                        report_progress()
                report_progress()
                if sheet is None:
                    sheet = workbook.create_sheet(self._excel_sheet_name(query_name, used_names))
                    if columns:
                        sheet.append(columns)
                continue

            used_copy = False
            if spec["db_type"] == "postgresql":
                def on_header(header: list[str]):
                    nonlocal columns
                    columns = header
                    if sheet is None:
                        start_sheet()

                def on_batch(rows: list[list[str]]):
                    nonlocal total_rows, sheet_number, sheet_rows
                    if sheet is None:
                        start_sheet()
                    for row in rows:
                        if sheet_rows >= self.EXCEL_MAX_DATA_ROWS:
                            sheet_number += 1
                            start_sheet()
                        sheet.append(row)
                        sheet_rows += 1
                        total_rows += 1
                    report_progress()

                try:
                    self._copy_postgres_query(
                        spec["sql"], spec["db_config"], spec["platform"], on_header, on_batch
                    )
                    used_copy = True
                except Exception as copy_error:
                    print(f"[EXPORT] PostgreSQL COPY failed, falling back to fetchmany: {copy_error}")
                    if total_rows > 0:
                        raise

            if not used_copy:
                for batch_columns, batch in self._iter_export_batches(
                    spec["sql"], spec["db_type"], spec["db_config"], spec["platform"]
                ):
                    if columns is None:
                        columns = list(batch_columns or [])
                    if sheet is None:
                        start_sheet()
                    if not batch:
                        continue

                    for row in batch:
                        if sheet_rows >= self.EXCEL_MAX_DATA_ROWS:
                            sheet_number += 1
                            start_sheet()
                        sheet.append([self._format_export_value(value) for value in row])
                        sheet_rows += 1
                        total_rows += 1
                    report_progress()

            if sheet is None:
                sheet = workbook.create_sheet(self._excel_sheet_name(query_name, used_names))
                if columns:
                    sheet.append(columns)

        if not workbook.worksheets:
            workbook.create_sheet("Sheet")

        progress_cb(96, "Excel dosyası kaydediliyor...", total_rows)
        handle = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
        handle.close()
        workbook.save(handle.name)
        progress_cb(100, "Tamamlandı", total_rows)
        return handle.name

    async def export_report_excel(
        self,
        request: ReportExecutionRequest,
        user: UserSchema,
        progress_cb: Callable[[int, str, int], None],
    ) -> tuple[str, str]:
        report = await self.get_authorized_report(request.report_id, user)
        platform = report.platform
        report_db_config = report.db_config
        if not report_db_config and not platform and not self.clickhouse_client:
            raise ValueError("No database connection available for this report")

        if report_db_config:
            db_type = report_db_config.get("db_type", "clickhouse").lower()
        elif platform:
            db_type = platform.db_type.lower()
        else:
            db_type = "clickhouse"

        queries = list(report.queries)
        if request.query_id:
            query = next((q for q in queries if q.id == request.query_id), None)
            if not query:
                raise ValueError("Query not found in report")
            queries = [query]

        query_specs = []
        for query in queries:
            sql = self._prepare_export_sql(
                query,
                request.filters,
                request.sort_by,
                request.sort_direction,
                db_type,
                report.global_filters or [],
                report.filter_by_department or False,
                user.department,
                report.department_filter_level,
                report.filter_by_step_department or False,
            )
            query_specs.append({
                "name": query.name or f"Query_{query.id}",
                "sql": sql,
                "db_type": db_type,
                "db_config": report_db_config,
                "platform": platform,
                "nested_queries": extract_expandable_nested_queries(query.visualization_config),
            })

        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        safe_name = re.sub(r"[^a-zA-Z0-9]+", "_", report.name)[:60] or "report"
        if request.query_id and queries:
            safe_name = re.sub(r"[^a-zA-Z0-9]+", "_", queries[0].name or safe_name)[:60] or safe_name
        filename = f"{safe_name}_{timestamp}.xlsx"

        progress_cb(2, "Sorgu çalıştırılıyor...", 0)
        file_path = await asyncio.to_thread(
            self._write_excel_from_queries,
            query_specs,
            progress_cb,
        )
        return file_path, filename

