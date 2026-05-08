"""
Standalone assertion test for _extract_musteri_companies_from_roles.

Run with: python dtbackend/test_musteri_companies_helper.py
"""
import sys
from pathlib import Path

# Make `app` importable when running from repo root
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from app.api.v1.endpoints.romiot.station.station import (
    _extract_musteri_companies_from_roles as helper_station,
)
from app.api.v1.endpoints.romiot.station.qr_code import (
    _extract_musteri_companies_from_roles as helper_qr,
)
from app.api.v1.endpoints.romiot.station.work_order import (
    _extract_musteri_companies_from_roles as helper_wo,
)


def run(helper, label):
    assert helper(None) == [], f"{label}: None should return []"
    assert helper([]) == [], f"{label}: empty list should return []"
    assert helper(["atolye:musteri"]) == [], f"{label}: no company role -> []"
    assert helper(["atolye:musteri_company:ACME"]) == ["ACME"], f"{label}: single"
    assert helper(
        ["atolye:musteri", "atolye:musteri_company:ACME", "atolye:musteri_company:FOO"]
    ) == ["ACME", "FOO"], f"{label}: order preserved"
    assert helper(
        ["atolye:musteri_company:ACME", "atolye:musteri_company:ACME"]
    ) == ["ACME"], f"{label}: dedupe"
    assert helper(
        ["atolye:musteri_company:  ACME  "]
    ) == ["ACME"], f"{label}: trim whitespace"
    assert helper(
        ["atolye:musteri_company:"]
    ) == [], f"{label}: empty value ignored"
    print(f"{label}: OK")


if __name__ == "__main__":
    run(helper_station, "station.py")
    run(helper_qr, "qr_code.py")
    run(helper_wo, "work_order.py")
    print("All helper tests passed.")
