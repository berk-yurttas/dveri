from typing import Dict, Any, Optional
from .base import WidgetStrategy


class CapacityAnalysisWidgetStrategy(WidgetStrategy):
    """Strategy for capacity analysis widget - analyze capacity by firma and eksensayisi"""

    def get_query(self, filters: Optional[Dict[str, Any]] = None) -> str:
        """
        Get capacity analysis query with filters

        Expected filters:
        - firma: Company/Facility (optional)
        - eksensayisi: Axis count (optional)
        - period: 'monthly' or 'weekly' (required)
        - metric: 'worktime' or 'rate' (required)
        """

        # Filters are mandatory for capacity analysis widget
        if not filters:
            raise ValueError("Filters are mandatory for capacity analysis widget")

        # Required filter validation
        required_filters = ['period', 'metric']
        missing_filters = [f for f in required_filters if f not in filters or not filters[f]]

        if missing_filters:
            raise ValueError(f"Missing required filters: {', '.join(missing_filters)}")

        # Extract filters (firma and eksensayisi are now optional)
        firma = filters.get('firma', None)
        eksensayisi = filters.get('eksensayisi', None)
        period = filters['period']  # 'monthly' or 'weekly'
        metric = filters['metric']  # 'worktime' or 'rate'

        # Validate period
        if period not in ['monthly', 'weekly']:
            raise ValueError(f"Invalid period: {period}. Must be 'monthly' or 'weekly'")

        # Validate metric
        if metric not in ['worktime', 'rate']:
            raise ValueError(f"Invalid metric: {metric}. Must be 'worktime' or 'rate'")

        # Determine which column to select based on period and metric
        if period == 'monthly' and metric == 'rate':
            metric_column = '"FirmaAxisMonthlyRate"'
            metric_label = 'Monthly Rate (%)'
        elif period == 'weekly' and metric == 'rate':
            metric_column = '"FirmaAxisWeeklyRate"'
            metric_label = 'Weekly Rate (%)'
        elif period == 'monthly' and metric == 'worktime':
            metric_column = '"FirmaAxisMonthlyWorkTime"'
            metric_label = 'Monthly WorkTime (hours)'
        elif period == 'weekly' and metric == 'worktime':
            metric_column = '"FirmaAxisWeeklyWorkTime"'
            metric_label = 'Weekly WorkTime (hours)'

        # Build the query
        query = f"""
        SELECT
            "Firma" as firma,
            eksensayisi,
            "MachineCount" as machine_count,
            "FirmaAxisMonthlyRate" as monthly_rate,
            "FirmaAxisWeeklyRate" as weekly_rate,
            "FirmaAxisMonthlyWorkTime" as monthly_worktime,
            "FirmaAxisWeeklyWorkTime" as weekly_worktime,
            {metric_column} as metric_value
        FROM mes_production.get_eksen_kapasite_analiz
        WHERE 1=1
        """

        if firma:
            query += f" AND \"Firma\" = '{firma}'"

        if eksensayisi:
            query += f" AND eksensayisi = {eksensayisi}"

        return query

    def process_result(self, result: Any, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Process capacity analysis widget result"""

        if not filters:
            raise ValueError("Filters are mandatory for capacity analysis widget")

        period = filters.get('period', 'monthly')
        metric = filters.get('metric', 'worktime')
        firma = filters.get('firma', '')
        eksensayisi = filters.get('eksensayisi', 0)

        if not result or len(result) == 0:
            return {
                "data": [],
                "filters": filters,
                "period": period,
                "metric": metric,
                "total_records": 0
            }

        # Process all rows (can return multiple records if firma/eksensayisi not filtered)
        data = []
        for row in result:
            # Handle both tuple/list (ClickHouse) and dict (PostgreSQL) row formats
            if isinstance(row, dict):
                firma_val = row.get('firma', '')
                eksensayisi_val = float(row.get('eksensayisi', 0)) if row.get('eksensayisi') else 0
                machine_count = int(row.get('machine_count', 0)) if row.get('machine_count') else 0
                monthly_rate = float(row.get('monthly_rate', 0)) if row.get('monthly_rate') else 0
                weekly_rate = float(row.get('weekly_rate', 0)) if row.get('weekly_rate') else 0
                monthly_worktime = float(row.get('monthly_worktime', 0)) if row.get('monthly_worktime') else 0
                weekly_worktime = float(row.get('weekly_worktime', 0)) if row.get('weekly_worktime') else 0
                metric_value = float(row.get('metric_value', 0)) if row.get('metric_value') else 0
            else:
                # Tuple/list format (ClickHouse)
                firma_val = row[0] if row[0] else ""
                eksensayisi_val = float(row[1]) if row[1] else 0
                machine_count = int(row[2]) if row[2] else 0
                monthly_rate = float(row[3]) if row[3] else 0
                weekly_rate = float(row[4]) if row[4] else 0
                monthly_worktime = float(row[5]) if row[5] else 0
                weekly_worktime = float(row[6]) if row[6] else 0
                metric_value = float(row[7]) if row[7] else 0

            data.append({
                "firma": firma_val,
                "eksensayisi": eksensayisi_val,
                "machine_count": machine_count,
                "metric_value": metric_value,
                "metric_label": self._get_metric_label(period, metric),
                "monthly_rate": monthly_rate,
                "weekly_rate": weekly_rate,
                "monthly_worktime": monthly_worktime,
                "weekly_worktime": weekly_worktime,
                "all_metrics": {
                    "monthly_rate": monthly_rate,
                    "weekly_rate": weekly_rate,
                    "monthly_worktime": monthly_worktime,
                    "weekly_worktime": weekly_worktime
                }
            })

        return {
            "data": data,
            "filters": filters,
            "period": period,
            "metric": metric,
            "total_records": len(data)
        }

    def _get_metric_label(self, period: str, metric: str) -> str:
        """Helper method to get metric label"""
        if period == 'monthly' and metric == 'rate':
            return 'Aylık Ortalama Kapasite Oranı (%)'
        elif period == 'weekly' and metric == 'rate':
            return 'Haftalık Ortalama Kapasite Oranı (%)'
        elif period == 'monthly' and metric == 'worktime':
            return 'Aylık Ortalama Çalışma Süresi (saat)'
        elif period == 'weekly' and metric == 'worktime':
            return 'Haftalık Ortalama Çalışma Süresi (saat)'
        return 'Unknown Metric'
