"""
Standalone assertion test for row detail card / trace panel report config.

Run with: python dtbackend/test_row_detail_config.py
"""
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from app.schemas.reports import VisualizationConfig  # noqa: E402

EXTRACTOR_PATH = ROOT / "app" / "services" / "sql_table_extractor.py"


def _load_extractor():
    spec = importlib.util.spec_from_file_location("sql_table_extractor", EXTRACTOR_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules["sql_table_extractor"] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


DETAIL_CARD = {
    "enabled": True,
    "title": "Seçili Parça Detay Kartı",
    "sql": "SELECT * FROM parts WHERE part_no = {{part_no}}",
    "paramFields": ["part_no"],
}

TRACE_PANEL = {
    "enabled": True,
    "paramFields": ["op_id"],
    "operationSql": "SELECT step, note FROM ops WHERE op_id = {{op_id}}",
    "durationSql": "SELECT prod_h, total_h FROM durations WHERE op_id = {{op_id}}",
    "links": [{"id": "l1", "title": "CMM Raporu", "linkText": "PDF aç", "url": "/docs/cmm/{{op_id}}.pdf"}],
}


def test_detail_card_survives_save_and_load_roundtrip():
    viz = VisualizationConfig(
        type="expandable",
        chartOptions={
            "detailCard": DETAIL_CARD,
            "nestedQueries": [
                {"id": "n1", "sql": "SELECT * FROM ops", "expandableFields": [], "tracePanel": TRACE_PANEL}
            ],
        },
    )
    stored = viz.dict()  # what reports_service persists
    assert stored["chart_options"]["detail_card"] == DETAIL_CARD, stored["chart_options"].get("detail_card")

    reloaded = VisualizationConfig(**stored).dict(by_alias=True)  # what the API returns
    assert reloaded["chartOptions"]["detailCard"] == DETAIL_CARD
    assert reloaded["chartOptions"]["nestedQueries"][0]["tracePanel"] == TRACE_PANEL


def test_detail_card_defaults_to_none():
    viz = VisualizationConfig(type="table")
    assert viz.chart_options.detail_card is None


def test_extractor_collects_detail_and_trace_sql():
    extractor = _load_extractor()
    sqls: list[str] = []
    stored_viz = {
        "type": "expandable",
        "chart_options": {
            "detail_card": DETAIL_CARD,
            "nested_queries": [{"id": "n1", "sql": "SELECT * FROM ops", "tracePanel": TRACE_PANEL}],
        },
    }
    extractor.collect_sql_from_nested(stored_viz, sqls)
    assert DETAIL_CARD["sql"] in sqls, sqls
    assert TRACE_PANEL["operationSql"] in sqls, sqls
    assert TRACE_PANEL["durationSql"] in sqls, sqls

    camel: list[str] = []
    extractor.collect_sql_from_nested({"chartOptions": {"detailCard": DETAIL_CARD}}, camel)
    assert DETAIL_CARD["sql"] in camel, camel


if __name__ == "__main__":
    failures = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except AssertionError as exc:
                failures += 1
                print(f"FAIL {name}: {exc}")
    print(f"{'FAILED' if failures else 'OK'}: {failures} failure(s)")
    sys.exit(1 if failures else 0)
