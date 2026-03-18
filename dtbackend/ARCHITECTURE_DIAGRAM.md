# Architecture Diagram - Aselsan Kaynaklı Durma Tracking System

## System Overview

```
╔════════════════════════════════════════════════════════════════════════════╗
║                    ASELSAN KAYNAKLI DURMA TRACKING SYSTEM                  ║
╚════════════════════════════════════════════════════════════════════════════╝

┌──────────────────────────────────────────────────────────────────────────┐
│                          DATA SOURCES (IVME DB)                           │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌────────────────────────────────┐  ┌────────────────────────────────┐  │
│  │   TALASLI IMALAT PLATFORM     │  │      KABLAJ PLATFORM          │  │
│  ├────────────────────────────────┤  ├────────────────────────────────┤  │
│  │                                │  │                                │  │
│  │  Table:                        │  │  Base Table:                   │  │
│  │  mekanik_sistemdeki_           │  │  kablaj_durus_kayitlari       │  │
│  │  guncel_hata_sayisi            │  │                                │  │
│  │                                │  │  View:                         │  │
│  │  Columns:                      │  │  kablaj_guncel_durus_view     │  │
│  │  - NAME                        │  │  (filters DURUM='ACIK')       │  │
│  │  - Sistemdeki Güncel           │  │                                │  │
│  │    Hata Sayısı                 │  │  Columns:                      │  │
│  │  - updated_at                  │  │  - WORKORDERNO                 │  │
│  │                                │  │  - Firma                       │  │
│  │  Sample: 10 companies          │  │  - DURUS_TIPI                  │  │
│  │          2-15 errors each      │  │  - SORUMLU                     │  │
│  │                                │  │  - DURUM                       │  │
│  └────────────────────────────────┘  │                                │  │
│              │                        │  Sample: 20+ work orders       │  │
│              │                        │          5 companies           │  │
│              │                        └────────────────────────────────┘  │
│              │                                     │                       │
└──────────────┼─────────────────────────────────────┼───────────────────────┘
               │                                     │
               ▼                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         CSUITE HISTORY SCHEDULER                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Class: CSuiteHistoryScheduler                                            │
│  Interval: 60 seconds (configurable)                                      │
│  File: app/services/csuite_history_scheduler.py                          │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────┐        │
│  │  run_once() Method - Executes Every Tick                     │        │
│  ├──────────────────────────────────────────────────────────────┤        │
│  │                                                               │        │
│  │  1. Determine Current Week (ISO format: YYYY-WNN)           │        │
│  │                                                               │        │
│  │  2. Fetch Tedarikci Data:                                    │        │
│  │     SELECT "Firma Adı", "Aylık Planlanan Doluluk Oranı"     │        │
│  │     FROM mes_production.get_firma_makina_planlanan_doluluk   │        │
│  │     → Store in per_firma_tedarikci{}                         │        │
│  │                                                               │        │
│  │  3. Fetch Aselsan Durma Data:                                │        │
│  │                                                               │        │
│  │     A) Talaşlı İmalat:                                        │        │
│  │        SELECT NAME, "Sistemdeki Güncel Hata Sayısı"         │        │
│  │        FROM mes_production.mekanik_sistemdeki_guncel_hata_   │        │
│  │        sayisi                                                 │        │
│  │        → Store in per_firma_aselsan{firma: {hata_sayisi: N}}│        │
│  │                                                               │        │
│  │     B) Kablaj:                                                │        │
│  │        SELECT DISTINCT "Firma", COUNT("WORKORDERNO")         │        │
│  │        OVER (PARTITION BY "Firma")                           │        │
│  │        FROM (SELECT DISTINCT "WORKORDERNO", "Firma"          │        │
│  │              FROM mes_production.kablaj_guncel_durus_view)   │        │
│  │        → Currently logged only (not stored)                  │        │
│  │                                                               │        │
│  │  4. For Each Firma:                                          │        │
│  │     - Check if current week already recorded                 │        │
│  │     - If not, write weekly snapshot                          │        │
│  │                                                               │        │
│  └──────────────────────────────────────────────────────────────┘        │
│                                                                            │
└────────────────────────────────────┬───────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    DATABASE CSUITE HISTORY STORE                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Class: DatabaseCSuiteHistoryStore                                        │
│  Platform: talasli_imalat (default) or kablaj                            │
│  File: app/services/csuite_history_store.py                              │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────┐        │
│  │  write_weekly_snapshot_async()                               │        │
│  ├──────────────────────────────────────────────────────────────┤        │
│  │                                                               │        │
│  │  Writes to TWO tables in single transaction:                 │        │
│  │                                                               │        │
│  │  1. INSERT/UPDATE                                             │        │
│  │     firma_makina_planlanan_doluluk_history                   │        │
│  │     - Firma Adı                                               │        │
│  │     - week                                                    │        │
│  │     - Aylık Planlanan Doluluk Oranı                          │        │
│  │     - recorded_at                                             │        │
│  │                                                               │        │
│  │  2. INSERT/UPDATE                                             │        │
│  │     aselsan_kaynakli_durma_history                           │        │
│  │     - platform                                                │        │
│  │     - firma                                                   │        │
│  │     - week                                                    │        │
│  │     - hata_sayisi                                             │        │
│  │     - recorded_at                                             │        │
│  │                                                               │        │
│  │  ON CONFLICT: Updates existing record (idempotent)           │        │
│  │                                                               │        │
│  └──────────────────────────────────────────────────────────────┘        │
│                                                                            │
└────────────────────────────────────┬───────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     HISTORY TABLES (MES_PRODUCTION)                       │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌────────────────────────────────┐  ┌────────────────────────────────┐  │
│  │  firma_makina_planlanan_       │  │  aselsan_kaynakli_durma_      │  │
│  │  doluluk_history               │  │  history (NEW)                 │  │
│  ├────────────────────────────────┤  ├────────────────────────────────┤  │
│  │                                │  │                                │  │
│  │  Purpose:                      │  │  Purpose:                      │  │
│  │  Store weekly snapshots of     │  │  Store weekly snapshots of     │  │
│  │  capacity utilization          │  │  Aselsan-caused errors         │  │
│  │                                │  │                                │  │
│  │  Structure:                    │  │  Structure:                    │  │
│  │  • Firma Adı (TEXT)            │  │  • platform (TEXT)             │  │
│  │  • week (TEXT)                 │  │  • firma (TEXT)                │  │
│  │  • Aylık Planlanan Doluluk     │  │  • week (TEXT)                 │  │
│  │    Oranı (NUMERIC 0-100)       │  │  • hata_sayisi (INTEGER >= 0)  │  │
│  │  • recorded_at (TIMESTAMPTZ)   │  │  • recorded_at (TIMESTAMPTZ)   │  │
│  │                                │  │                                │  │
│  │  UNIQUE (Firma Adı, week)      │  │  UNIQUE (platform, firma, week)│  │
│  │                                │  │                                │  │
│  │  One record per company/week   │  │  One record per platform/      │  │
│  │                                │  │  company/week                  │  │
│  │                                │  │                                │  │
│  │  Example:                      │  │  Example:                      │  │
│  │  Mikronmak Oto | 2026-W11 | 87 │  │  talasli_imalat | Mikronmak   │  │
│  │                                │  │  Oto | 2026-W11 | 8           │  │
│  │                                │  │                                │  │
│  └────────────────────────────────┘  └────────────────────────────────┘  │
│              │                                     │                       │
│              └──────────────┬──────────────────────┘                       │
│                             │                                              │
│                             ▼                                              │
│                    Used by Frontend/APIs                                  │
│                    for historical visualization                           │
│                                                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Timeline

```
Week Boundary (Monday 00:00 UTC)
│
├─ Current Week: 2026-W11
│
├─ Scheduler Tick (every 60s)
│  ├─ Check: "Is 2026-W11 already recorded?"
│  │  │
│  │  ├─ YES → Skip (already have this week's data)
│  │  │
│  │  └─ NO → Proceed with snapshot
│  │     ├─ Fetch current error counts
│  │     ├─ Write to doluluk_history
│  │     ├─ Write to aselsan_durma_history
│  │     └─ Log: "written_db=1"
│  │
│  └─ Next tick (60s later): Check again → Skip (already recorded)
│
└─ Next Week Boundary (2026-W12)
   └─ Process repeats for new week
```

## Error Handling

```
┌─────────────────────────────────────────┐
│  Scheduler Tick                          │
└───────────┬─────────────────────────────┘
            │
            ├─ Fetch Tedarikci Data
            │  ├─ ✅ Success → Store in dict
            │  └─ ❌ Error → Log warning, continue
            │
            ├─ Fetch Aselsan Durma (Talaşlı)
            │  ├─ ✅ Success → Store in dict
            │  └─ ❌ Error → Log warning, continue
            │
            ├─ Fetch Aselsan Durma (Kablaj)
            │  ├─ ✅ Success → Log data
            │  └─ ❌ Error → Log warning, continue
            │
            └─ Write to Database
               ├─ For each firma:
               │  ├─ Check latest week
               │  │  ├─ ✅ Success
               │  │  └─ ❌ Error → Continue to next
               │  │
               │  └─ Write snapshot
               │     ├─ ✅ Success → written_db++
               │     └─ ❌ Error → Log error, continue
               │
               └─ Log summary: "firmas=X written_db=Y"
```

## Storage Pattern Comparison

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         BEFORE (JSON Only)                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Source: CSuite API → Manual fetch                                      │
│     ↓                                                                    │
│  Store: csuite_weekly_history.json (Kablaj/EMM, Kart Dizgi)            │
│     ↓                                                                    │
│  Access: File read → Parse JSON → Return                                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                      AFTER (Hybrid: DB + JSON)                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Talaşlı İmalat:                                                         │
│  Source: IVME DB → Auto-scheduled fetch                                 │
│     ↓                                                                    │
│  Store: PostgreSQL tables (doluluk_history, aselsan_durma_history)     │
│     ↓                                                                    │
│  Access: SQL queries → Indexed, fast                                    │
│                                                                          │
│  Kablaj/EMM, Kart Dizgi:                                                │
│  Source: CSuite API (when available)                                    │
│     ↓                                                                    │
│  Store: csuite_weekly_history.json                                      │
│     ↓                                                                    │
│  Access: File read → Parse JSON                                         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Week Key Format

```
ISO Week Format: YYYY-WNN

Examples:
  2026-W01 = First week of 2026
  2026-W11 = Eleventh week of 2026 (current in examples)
  2026-W52 = Last week of 2026

Calculation:
  Python: datetime.now(timezone.utc).isocalendar()
  → Returns: (year, week, weekday)
  → Format: f"{year}-W{week:02d}"

Properties:
  ✓ Sortable alphabetically
  ✓ Human-readable
  ✓ ISO 8601 standard
  ✓ Unique per week globally
```

## Legend

```
┌────────┐
│ Table  │  = Database Table
└────────┘

┌────────┐
│ View   │  = Database View (filtered/aggregated)
└────────┘

     │
     ▼      = Data Flow Direction

  ✅ / ❌   = Success / Error States

  ← NEW    = Newly implemented component
```
