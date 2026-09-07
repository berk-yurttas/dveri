"""
Standalone assertion test for SQL table extraction used by Odak report update.

Run with: python dtbackend/test_sql_table_extractor.py
"""
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MODULE_PATH = ROOT / "app" / "services" / "sql_table_extractor.py"


def _load_extractor():
    spec = importlib.util.spec_from_file_location("sql_table_extractor", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules["sql_table_extractor"] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def match_known_tables(extracted, known):
    if not known:
        return list(extracted), []
    known_map = {name.lower(): name for name in known}
    matched = []
    skipped = []
    seen = set()
    for table in extracted:
        canonical = known_map.get(table.lower())
        if not canonical:
            skipped.append(table)
            continue
        key = canonical.lower()
        if key in seen:
            continue
        seen.add(key)
        matched.append(canonical)
    return matched, skipped


def main():
    extractor = _load_extractor()
    extract_tables_from_sql = extractor.extract_tables_from_sql
    extract_tables_from_sqls = extractor.extract_tables_from_sqls
    collect_sql_from_nested = extractor.collect_sql_from_nested

    sql = """
    -- ignore FROM fake_table
    WITH current_month AS (
        SELECT * FROM mes_production.kablaj_kapasite_view
    ), previous_month AS (
        SELECT 1
    )
    SELECT *
    FROM current_month c
    LEFT JOIN mes_production.company_mapping cm ON 1=1
    LEFT JOIN mes_production."tokadb_acik_sas" t ON 1=1
    JOIN other_schema.mes_data m ON 1=1
    """
    tables = extract_tables_from_sql(sql)
    assert "kablaj_kapasite_view" in tables
    assert "company_mapping" in tables
    assert "tokadb_acik_sas" in tables
    assert "mes_data" in tables
    assert "current_month" not in tables
    assert "previous_month" not in tables
    assert "fake_table" not in tables

    sql2 = "SELECT a, b AS fake_cte FROM mes_production.real_table"
    assert extract_tables_from_sql(sql2) == ["real_table"]

    subquery = "SELECT * FROM (SELECT 1) x JOIN generate_series(1,2) g ON true"
    assert extract_tables_from_sql(subquery) == []

    nested_sqls: list[str] = []
    collect_sql_from_nested(
        {
            "chartOptions": {
                "nestedQueries": [
                    {"sql": "SELECT * FROM mes_production.child_table"},
                    {
                        "sql": "SELECT * FROM parent_src",
                        "nestedQueries": [{"sql": "SELECT * FROM deep_table"}],
                    },
                ]
            }
        },
        nested_sqls,
    )
    nested_tables = extract_tables_from_sqls(nested_sqls)
    assert nested_tables == ["child_table", "parent_src", "deep_table"]

    matched, skipped = match_known_tables(
        ["mes_data", "unknown_tbl", "MES_DATA"],
        {"mes_data", "mes_machines"},
    )
    assert matched == ["mes_data"]
    assert skipped == ["unknown_tbl"]

    print("ok")


if __name__ == "__main__":
    main()
