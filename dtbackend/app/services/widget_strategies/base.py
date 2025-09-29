from typing import List, Dict, Any, Optional
from abc import ABC, abstractmethod


class WidgetStrategy(ABC):
    """Abstract base class for widget strategies"""
    
    @abstractmethod
    def get_query(self, filters: Optional[Dict[str, Any]] = None) -> str:
        """Get the ClickHouse query for this widget type"""
        pass
    
    @abstractmethod
    def process_result(self, result: Any, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Process the query result into widget-specific format"""
        pass
