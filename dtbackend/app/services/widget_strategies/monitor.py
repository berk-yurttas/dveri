from typing import Any

from .base import WidgetStrategy


class MonitorWidgetStrategy(WidgetStrategy):
    """Strategy for monitor/gauge widget"""

    def get_query(self, filters: dict[str, Any] | None = None) -> str:
        """Get monitor widget query"""
        query = """
        SELECT 
            infrastructure_id,
            infrastructure_name,
            AVG(performance_score) as performance,
            CASE 
                WHEN AVG(performance_score) >= 80 THEN 'Aktif'
                WHEN AVG(performance_score) >= 60 THEN 'Uyarı'
                ELSE 'Kritik'
            END as status
        FROM infrastructure_metrics
        WHERE measurement_time >= NOW() - INTERVAL 1 HOUR
        """

        if filters:
            if filters.get('infrastructure_id'):
                query += f" AND infrastructure_id = '{filters['infrastructure_id']}'"

        query += " GROUP BY infrastructure_id, infrastructure_name"

        return query

    def process_result(self, result: Any, filters: dict[str, Any] | None = None) -> dict[str, Any]:
        """Process monitor widget result"""
        if not result or not result[0]:
            # Return empty state structure instead of raising error
            infra_id = str(filters.get('infrastructure_id', '')) if filters else ''
            return {
                "infrastructure_id": infra_id,
                "infrastructure_name": f"Cihaz {infra_id}" if infra_id else "Unknown",
                "performance": 0,
                "status": "Bilinmiyor",
                "color": "text-gray-500"
            }

        row = result[0]
        performance = int(row[2]) if len(row) > 2 and row[2] else 0

        # Determine color based on performance
        if performance >= 80:
            color = "text-green-600"
        elif performance >= 60:
            color = "text-yellow-600"
        else:
            color = "text-red-600"

        return {
            "infrastructure_id": row[0],
            "infrastructure_name": row[1],
            "performance": performance,
            "status": row[3] if len(row) > 3 else "Unknown",
            "color": color
        }
