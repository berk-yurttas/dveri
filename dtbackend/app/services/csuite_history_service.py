from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock
from typing import Any


class CSuiteHistoryService:
    """Stores CSuite weekly metric snapshots in a local JSON file."""

    _lock = Lock()
    _categories = ["Talaşlı İmalat", "Kablaj/EMM", "Kart Dizgi"]
    _history_file = Path(__file__).resolve().parents[2] / "data" / "csuite_weekly_history.json"

    @classmethod
    def _week_key(cls, dt: datetime) -> str:
        year, week, _ = dt.isocalendar()
        return f"{year}-W{week:02d}"

    @classmethod
    def _empty_payload(cls) -> dict[str, Any]:
        return {"companies": {}, "updated_at": datetime.now(timezone.utc).isoformat()}

    @classmethod
    def _load(cls) -> dict[str, Any]:
        if not cls._history_file.exists():
            return cls._empty_payload()
        try:
            with cls._history_file.open("r", encoding="utf-8") as f:
                data = json.load(f)
            if not isinstance(data, dict) or "companies" not in data:
                return cls._empty_payload()
            return data
        except Exception:
            return cls._empty_payload()

    @classmethod
    def _save(cls, payload: dict[str, Any]) -> None:
        cls._history_file.parent.mkdir(parents=True, exist_ok=True)
        payload["updated_at"] = datetime.now(timezone.utc).isoformat()
        with cls._history_file.open("w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

    @classmethod
    def _normalize_metric_map(cls, values: dict[str, float | int]) -> dict[str, int]:
        aliases = {
            "Talaşlı İmalat": ["Talaşlı İmalat", "Talasli Imalat", "Talasli İmalat"],
            "Kablaj/EMM": ["Kablaj/EMM"],
            "Kart Dizgi": ["Kart Dizgi"],
        }
        normalized: dict[str, int] = {}
        for category in cls._categories:
            raw = 0
            for alias in aliases.get(category, [category]):
                if alias in values:
                    raw = values.get(alias, 0)
                    break
            try:
                normalized[category] = max(0, min(100, int(round(float(raw)))))
            except Exception:
                normalized[category] = 0
        return normalized

    @classmethod
    def _sorted_weeks(cls, entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return sorted(entries, key=lambda e: e.get("week", ""))

    @classmethod
    def _synthetic_value(cls, firma: str, category: str, base: int, week_offset: int) -> int:
        seed = sum(ord(c) for c in f"{firma}:{category}:{week_offset}")
        delta = (seed % 7) - 3  # -3..+3
        return max(0, min(100, base + delta))

    @classmethod
    def _build_backfill_entries(
        cls,
        firma: str,
        latest_week: str,
        tedarikci: dict[str, int],
        aselsan: dict[str, int],
    ) -> list[dict[str, Any]]:
        # Backfill 9 older weekly snapshots so each company has a 10-week series.
        year = int(latest_week.split("-W")[0])
        week = int(latest_week.split("-W")[1])
        latest_dt = datetime.fromisocalendar(year, week, 1).replace(tzinfo=timezone.utc)

        entries: list[dict[str, Any]] = []
        for offset in range(9, 0, -1):
            dt = latest_dt - timedelta(weeks=offset)
            week_key = cls._week_key(dt)
            entries.append(
                {
                    "week": week_key,
                    "recorded_at": datetime.now(timezone.utc).isoformat(),
                    "is_synthetic": True,  # Flag to mark synthetic/backfilled data
                    "tedarikci_kapasite_analizi": {
                        c: cls._synthetic_value(firma, c, tedarikci.get(c, 0), offset) for c in cls._categories
                    },
                    "aselsan_kaynakli_durma": {
                        c: cls._synthetic_value(firma, c, aselsan.get(c, 0), offset) for c in cls._categories
                    },
                }
            )
        return entries

    @classmethod
    def record_snapshot(
        cls,
        firma: str,
        tedarikci_kapasite_analizi: dict[str, float | int],
        aselsan_kaynakli_durma: dict[str, float | int],
        week: str | None = None,
        backfill_missing_weeks: bool = False,  # Disabled by default
    ) -> dict[str, Any]:
        firma = firma.strip()
        if not firma:
            raise ValueError("firma is required")

        target_week = week or cls._week_key(datetime.now(timezone.utc))
        tedarikci = cls._normalize_metric_map(tedarikci_kapasite_analizi)
        aselsan = cls._normalize_metric_map(aselsan_kaynakli_durma)

        with cls._lock:
            data = cls._load()
            companies = data.setdefault("companies", {})
            entries = companies.setdefault(firma, [])

            if not isinstance(entries, list):
                entries = []

            existing_idx = next((i for i, e in enumerate(entries) if e.get("week") == target_week), None)
            new_entry = {
                "week": target_week,
                "recorded_at": datetime.now(timezone.utc).isoformat(),
                "tedarikci_kapasite_analizi": tedarikci,
                "aselsan_kaynakli_durma": aselsan,
            }

            if existing_idx is None:
                entries.append(new_entry)
            else:
                entries[existing_idx] = new_entry

            # Backfill disabled - do not generate synthetic data
            # if backfill_missing_weeks and len(entries) <= 1:
            #     entries.extend(cls._build_backfill_entries(firma, target_week, tedarikci, aselsan))

            entries = cls._sorted_weeks(entries)[-10:]
            companies[firma] = entries
            cls._save(data)

        return cls.get_company_history(firma=firma, limit=10)

    @classmethod
    def get_company_history(cls, firma: str, limit: int = 10) -> dict[str, Any]:
        firma = firma.strip()
        if not firma:
            raise ValueError("firma is required")

        with cls._lock:
            data = cls._load()
            entries = data.get("companies", {}).get(firma, [])

        if not isinstance(entries, list):
            entries = []

        weeks = cls._sorted_weeks(entries)[-max(1, min(limit, 52)) :]
        latest = weeks[-1] if weeks else None
        
        # Compare with 4 weeks ago (last month) only if we have at least 5 weeks of data
        comparison = weeks[-5] if len(weeks) >= 5 else None

        changes = {
            "tedarikci_kapasite_analizi": {c: 0 for c in cls._categories},
            "aselsan_kaynakli_durma": {c: 0 for c in cls._categories},
        }
        changes_percent = {
            "tedarikci_kapasite_analizi": {c: 0.0 for c in cls._categories},
            "aselsan_kaynakli_durma": {c: 0.0 for c in cls._categories},
        }
        if latest and comparison:
            for c in cls._categories:
                l_t = int(latest.get("tedarikci_kapasite_analizi", {}).get(c, 0))
                p_t = int(comparison.get("tedarikci_kapasite_analizi", {}).get(c, 0))
                changes["tedarikci_kapasite_analizi"][c] = l_t - p_t
                if p_t == 0:
                    changes_percent["tedarikci_kapasite_analizi"][c] = 0.0
                else:
                    changes_percent["tedarikci_kapasite_analizi"][c] = round(((l_t - p_t) / p_t) * 100, 1)

                l_a = int(latest.get("aselsan_kaynakli_durma", {}).get(c, 0))
                p_a = int(comparison.get("aselsan_kaynakli_durma", {}).get(c, 0))
                changes["aselsan_kaynakli_durma"][c] = l_a - p_a
                if p_a == 0:
                    changes_percent["aselsan_kaynakli_durma"][c] = 0.0
                else:
                    changes_percent["aselsan_kaynakli_durma"][c] = round(((l_a - p_a) / p_a) * 100, 1)

        return {
            "firma": firma,
            "weeks": weeks,
            "latest_week": latest.get("week") if latest else None,
            "changes": changes,
            "changes_percent": changes_percent,
        }


