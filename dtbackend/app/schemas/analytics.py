from pydantic import BaseModel
from typing import Optional, Dict, Any

class AnalyticsEvent(BaseModel):
    event_type: str
    path: str
    session_id: str
    user_id: Optional[str] = None
    duration: int = 0
    meta: Dict[str, Any] = {}
