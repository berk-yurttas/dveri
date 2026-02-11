import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import settings

router = APIRouter()

SAP_SEYIR_BASE_URL = settings.SAP_SEYIR_BASE_URL
SAP_TIMEOUT = 1200.0


class CooisRequest(BaseModel):
    stok_no: str


class Zaselpp0052Request(BaseModel):
    siparis_no: str
    uretim_yeri: str


class ZbildsorguRequest(BaseModel):
    stok_no: str


class Zascs15Request(BaseModel):
    stok_no: str
    uretim_yeri: str


class Zaselpp0045Request(BaseModel):
    ust_malzemeler: list[str]
    uretim_yeri: str


async def _forward_to_sap(endpoint: str, payload: dict) -> any:
    """Forward a request to the SAP API and return the JSON response."""
    url = f"{SAP_SEYIR_BASE_URL}/{endpoint}"
    try:
        async with httpx.AsyncClient(timeout=SAP_TIMEOUT) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail=f"SAP API timeout: {endpoint}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"SAP API error: {e.response.text}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"SAP API connection error: {str(e)}")


@router.post("/coois-sync")
async def coois_sync(request: CooisRequest):
    return await _forward_to_sap("coois-sync", request.model_dump())


@router.post("/zaselpp0052-sync")
async def zaselpp0052_sync(request: Zaselpp0052Request):
    return await _forward_to_sap("zaselpp0052-sync", request.model_dump())


@router.post("/zbildsorgu-sync")
async def zbildsorgu_sync(request: ZbildsorguRequest):
    return await _forward_to_sap("zbildsorgu-sync", request.model_dump())


@router.post("/zascs15-sync")
async def zascs15_sync(request: Zascs15Request):
    return await _forward_to_sap("zascs15-sync", request.model_dump())


@router.post("/zaselpp0045-sync")
async def zaselpp0045_sync(request: Zaselpp0045Request):
    return await _forward_to_sap("zaselpp0045-sync", request.model_dump())
