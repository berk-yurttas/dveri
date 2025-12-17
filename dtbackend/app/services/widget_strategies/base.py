from abc import ABC, abstractmethod
from typing import Any


class WidgetStrategy(ABC):
    """Abstract base class for widget strategies"""

    @abstractmethod
    def get_query(self, filters: dict[str, Any] | None = None) -> str:
        """Get the ClickHouse query for this widget type"""
        pass

    @abstractmethod
    def process_result(self, result: Any, filters: dict[str, Any] | None = None) -> dict[str, Any]:
        """Process the query result into widget-specific format"""
        pass
