from typing import Dict, Any, Optional
from .base import WidgetStrategy


class MachineOeeWidgetStrategy(WidgetStrategy):
    """Strategy for machine OEE analysis widget - analyze OEE by firma and machine"""

    def get_query(self, filters: Optional[Dict[str, Any]] = None) -> str:
        """
        Get machine OEE query with filters

        Expected filters:
        - firma: Company/Facility (optional)
        - machinecode: Machine code (optional)
        """

        # Extract filters
        firma = filters.get('firma', None) if filters else None
        machinecode = filters.get('machinecode', None) if filters else None

        # Build the query
        query = """
        SELECT
            "NAME" as firma,
            "MachineCode" as machinecode,
            "AVG_OEE_7_Days" as avg_oee_7_days,
            "AVG_OEE_30_Days" as avg_oee_30_days,
            "AVG_OEE_60_Days" as avg_oee_60_days,
            "AVG_OEE_90_Days" as avg_oee_90_days
        FROM mes_production.mes_production_firma_tezgah_oee
        WHERE 1=1
        """

        if firma:
            query += f" AND \"NAME\" = '{firma}'"

        if machinecode:
            query += f" AND \"MachineCode\" = '{machinecode}'"

        return query

    def process_result(self, result: Any, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Process machine OEE widget result"""

        firma = filters.get('firma', '') if filters else ''
        machinecode = filters.get('machinecode', '') if filters else ''

        if not result or len(result) == 0:
            return {
                "data": [],
                "filters": filters,
                "total_records": 0
            }

        # Process all rows
        data = []
        for row in result:
            # Handle both tuple/list (ClickHouse) and dict (PostgreSQL) row formats
            if isinstance(row, dict):
                firma_val = row.get('firma', '')
                machinecode_val = row.get('machinecode', '')
                avg_oee_7_days = float(row.get('avg_oee_7_days', 0)) if row.get('avg_oee_7_days') else 0
                avg_oee_30_days = float(row.get('avg_oee_30_days', 0)) if row.get('avg_oee_30_days') else 0
                avg_oee_60_days = float(row.get('avg_oee_60_days', 0)) if row.get('avg_oee_60_days') else 0
                avg_oee_90_days = float(row.get('avg_oee_90_days', 0)) if row.get('avg_oee_90_days') else 0
            else:
                # Tuple/list format (ClickHouse)
                firma_val = row[0] if row[0] else ""
                machinecode_val = row[1] if row[1] else ""
                avg_oee_7_days = float(row[2]) if row[2] else 0
                avg_oee_30_days = float(row[3]) if row[3] else 0
                avg_oee_60_days = float(row[4]) if row[4] else 0
                avg_oee_90_days = float(row[5]) if row[5] else 0

            data.append({
                "firma": firma_val,
                "machinecode": machinecode_val,
                "avg_oee_7_days": avg_oee_7_days,
                "avg_oee_30_days": avg_oee_30_days,
                "avg_oee_60_days": avg_oee_60_days,
                "avg_oee_90_days": avg_oee_90_days
            })

        return {
            "data": data,
            "filters": filters,
            "total_records": len(data)
        }
