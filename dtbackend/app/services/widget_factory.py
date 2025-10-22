from typing import List, Dict, Any, Optional
from .widget_strategies.base import WidgetStrategy
from .widget_strategies.efficiency import EfficiencyWidgetStrategy
from .widget_strategies.monitor import MonitorWidgetStrategy
from .widget_strategies.product_test import ProductTestWidgetStrategy
from .widget_strategies.test_analysis import TestAnalysisWidgetStrategy
from .widget_strategies.test_duration import TestDurationWidgetStrategy
from .widget_strategies.excel_export import ExcelExportWidgetStrategy
from .widget_strategies.measurement_analysis import MeasurementAnalysisWidgetStrategy
from .widget_strategies.serialno_comparison import SerialNoComparisonWidgetStrategy
from .widget_strategies.test_duration_analysis import TestDurationAnalysisWidgetStrategy
from .widget_strategies.capacity_analysis import CapacityAnalysisWidgetStrategy
from .widget_strategies.machine_oee import MachineOeeWidgetStrategy


class WidgetFactory:
    """Factory class for creating widget strategies"""
    
    _strategies = {
        'efficiency': EfficiencyWidgetStrategy(),
        'monitor': MonitorWidgetStrategy(),
        'gauge': MonitorWidgetStrategy(),  # Alias for monitor
        'product_test': ProductTestWidgetStrategy(),
        'test_analysis': TestAnalysisWidgetStrategy(),
        'test_duration': TestDurationWidgetStrategy(),
        'excel_export': ExcelExportWidgetStrategy(),
        'measurement_analysis': MeasurementAnalysisWidgetStrategy(),
        'serialno_comparison': SerialNoComparisonWidgetStrategy(),
        'test_duration_analysis': TestDurationAnalysisWidgetStrategy(),
        'capacity_analysis': CapacityAnalysisWidgetStrategy(),
        'machine_oee': MachineOeeWidgetStrategy(),
    }
    
    @classmethod
    def get_strategy(cls, widget_type: str) -> WidgetStrategy:
        """Get strategy for widget type"""
        strategy = cls._strategies.get(widget_type.lower())
        if not strategy:
            raise ValueError(f"Unsupported widget type: {widget_type}")
        return strategy
    
    @classmethod
    def register_strategy(cls, widget_type: str, strategy: WidgetStrategy):
        """Register a new widget strategy"""
        cls._strategies[widget_type.lower()] = strategy
    
    @classmethod
    def get_supported_types(cls) -> List[str]:
        """Get list of supported widget types"""
        return list(cls._strategies.keys())
    
    @classmethod
    def create_widget_data(
        cls,
        db_client,
        widget_type: str,
        filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create widget data using appropriate strategy"""
        strategy = cls.get_strategy(widget_type)

        try:
            # Execute real query
            query = strategy.get_query(filters)
            result = cls._execute_query(db_client, query)
            print(result)
            return strategy.process_result(result, filters)

        except Exception as e:
            print(f"Error executing query for widget {widget_type}: {e}")
            # Return error response instead of None to avoid API validation errors
            return {
                "error": True,
                "message": f"Failed to execute query for widget {widget_type}: {str(e)}",
                "widget_type": widget_type,
                "filters": filters or {}
            }

    @classmethod
    def _execute_query(cls, db_client, query: str) -> Any:
        """Execute query on different database client types"""
        # Detect client type and execute accordingly
        client_type = type(db_client).__name__

        if client_type == 'Client':  # ClickHouse client
            return db_client.execute(query)
        elif client_type == 'Connection':  # pyodbc (MSSQL) or psycopg2 (PostgreSQL)
            cursor = db_client.cursor()
            try:
                cursor.execute(query)
                result = cursor.fetchall()
                return result
            finally:
                cursor.close()
        else:
            # Try direct execute first (ClickHouse-style)
            if hasattr(db_client, 'execute'):
                return db_client.execute(query)
            # Try cursor-based execution (PostgreSQL/MSSQL-style)
            elif hasattr(db_client, 'cursor'):
                cursor = db_client.cursor()
                try:
                    cursor.execute(query)
                    result = cursor.fetchall()
                    return result
                finally:
                    cursor.close()
            else:
                raise ValueError(f"Unsupported database client type: {client_type}")
