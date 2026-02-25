import os
from pathlib import Path
from typing import Optional

import httpx
import markdown
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from dotenv import load_dotenv


load_dotenv()


def _as_bool(value: str, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


PORT = int(os.getenv("PORT", "8787"))
CORS_ORIGINS = [v.strip() for v in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5500").split(",") if v.strip()]

OPENPROJECT_URL = os.getenv("OPENPROJECT_URL", "http://localhost:8080")
OPENPROJECT_API_TOKEN = os.getenv("OPENPROJECT_API_TOKEN", "")
OPENPROJECT_PROJECT_ID = int(os.getenv("OPENPROJECT_PROJECT_ID", "3"))
OPENPROJECT_COLUMN_QUERY_ID = int(os.getenv("OPENPROJECT_COLUMN_QUERY_ID", "30"))
OPENPROJECT_PLATFORM_CUSTOM_FIELD_ID = int(os.getenv("OPENPROJECT_PLATFORM_CUSTOM_FIELD_ID", "2"))
OPENPROJECT_TALEP_SAHIBI_CUSTOM_FIELD_ID = int(os.getenv("OPENPROJECT_TALEP_SAHIBI_CUSTOM_FIELD_ID", "3"))
OPENPROJECT_BIRIM_CUSTOM_FIELD_ID = int(os.getenv("OPENPROJECT_BIRIM_CUSTOM_FIELD_ID", "4"))
OPENPROJECT_TYPE_ID = int(os.getenv("OPENPROJECT_TYPE_ID", "1"))
OPENPROJECT_VERIFY_SSL = _as_bool(os.getenv("OPENPROJECT_VERIFY_SSL", "false"))

POCKETBASE_URL = os.getenv("POCKETBASE_URL", "")
POCKETBASE_SAVE_URL = os.getenv("POCKETBASE_SAVE_URL", POCKETBASE_URL)
POCKETBASE_ADMIN_EMAIL = os.getenv("POCKETBASE_ADMIN_EMAIL", "")
POCKETBASE_ADMIN_PASSWORD = os.getenv("POCKETBASE_ADMIN_PASSWORD", "")


class OpenProjectOverride(BaseModel):
    openproject_url: Optional[str] = None
    openproject_api_token: Optional[str] = None
    openproject_project_id: Optional[int] = None
    openproject_column_query_id: Optional[int] = None
    openproject_platform_custom_field_id: Optional[int] = None
    openproject_talep_sahibi_custom_field_id: Optional[int] = None
    openproject_birim_custom_field_id: Optional[int] = None
    openproject_type_id: Optional[int] = None
    openproject_verify_ssl: Optional[bool] = None


class FeedbackCreate(BaseModel):
    subject: str = Field(..., min_length=1, max_length=255)
    platform: str = Field(..., min_length=1)
    talep_sahibi: str = Field(..., min_length=1)
    birim: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1)
    attachments: Optional[list[str]] = Field(default_factory=list)
    openproject_config: Optional[OpenProjectOverride] = None


class FeedbackResponse(BaseModel):
    success: bool
    message: str
    work_package_id: Optional[int] = None


app = FastAPI(title="OpenProject Widget API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


_README_PATH = Path(__file__).resolve().parent.parent / "README.md"


@app.get("/docs", response_class=HTMLResponse)
async def docs_page() -> HTMLResponse:
    if not _README_PATH.is_file():
        raise HTTPException(status_code=404, detail="README.md not found")

    md_text = _README_PATH.read_text(encoding="utf-8")
    html_body = markdown.markdown(md_text, extensions=["fenced_code", "tables", "toc", "codehilite"])

    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OpenProject Feedback Widget — Documentation</title>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; }}
    body {{
      margin: 0; padding: 40px 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #f6f8fa; color: #24292f;
      line-height: 1.6;
    }}
    .container {{
      max-width: 900px; margin: 0 auto;
      background: #fff; border: 1px solid #d0d7de; border-radius: 8px;
      padding: 40px 48px;
    }}
    h1 {{ font-size: 2em; border-bottom: 1px solid #d8dee4; padding-bottom: 0.3em; }}
    h2 {{ font-size: 1.5em; border-bottom: 1px solid #d8dee4; padding-bottom: 0.3em; margin-top: 1.5em; }}
    h3 {{ font-size: 1.25em; margin-top: 1.3em; }}
    a {{ color: #0969da; text-decoration: none; }}
    a:hover {{ text-decoration: underline; }}
    code {{
      background: #f0f3f6; padding: 0.2em 0.4em; border-radius: 4px;
      font-size: 0.9em; font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    }}
    pre {{
      background: #161b22; color: #e6edf3; border-radius: 6px;
      padding: 16px; overflow-x: auto; line-height: 1.45;
    }}
    pre code {{
      background: transparent; padding: 0; color: inherit; font-size: 0.85em;
    }}
    table {{
      border-collapse: collapse; width: 100%; margin: 1em 0;
    }}
    th, td {{
      border: 1px solid #d0d7de; padding: 8px 12px; text-align: left;
    }}
    th {{ background: #f6f8fa; font-weight: 600; }}
    blockquote {{
      margin: 1em 0; padding: 0.5em 1em;
      border-left: 4px solid #d0d7de; color: #57606a; background: #f6f8fa;
    }}
    hr {{ border: none; border-top: 1px solid #d8dee4; margin: 2em 0; }}
    ul, ol {{ padding-left: 2em; }}
    li + li {{ margin-top: 0.25em; }}
  </style>
</head>
<body>
  <div class="container">
    {html_body}
  </div>
</body>
</html>"""
    return HTMLResponse(content=html)


@app.post("/api/v1/feedback", response_model=FeedbackResponse)
async def create_feedback(feedback_data: FeedbackCreate) -> FeedbackResponse:
    cfg = feedback_data.openproject_config
    openproject_url = (cfg.openproject_url if cfg and cfg.openproject_url else OPENPROJECT_URL).rstrip("/")
    openproject_api_token = cfg.openproject_api_token if cfg and cfg.openproject_api_token else OPENPROJECT_API_TOKEN
    openproject_project_id = cfg.openproject_project_id if cfg and cfg.openproject_project_id is not None else OPENPROJECT_PROJECT_ID
    openproject_column_query_id = cfg.openproject_column_query_id if cfg and cfg.openproject_column_query_id is not None else OPENPROJECT_COLUMN_QUERY_ID
    platform_field_id = (
        cfg.openproject_platform_custom_field_id
        if cfg and cfg.openproject_platform_custom_field_id is not None
        else OPENPROJECT_PLATFORM_CUSTOM_FIELD_ID
    )
    talep_sahibi_field_id = (
        cfg.openproject_talep_sahibi_custom_field_id
        if cfg and cfg.openproject_talep_sahibi_custom_field_id is not None
        else OPENPROJECT_TALEP_SAHIBI_CUSTOM_FIELD_ID
    )
    birim_field_id = (
        cfg.openproject_birim_custom_field_id
        if cfg and cfg.openproject_birim_custom_field_id is not None
        else OPENPROJECT_BIRIM_CUSTOM_FIELD_ID
    )
    type_id = cfg.openproject_type_id if cfg and cfg.openproject_type_id is not None else OPENPROJECT_TYPE_ID
    verify_ssl = cfg.openproject_verify_ssl if cfg and cfg.openproject_verify_ssl is not None else OPENPROJECT_VERIFY_SSL

    if not openproject_api_token:
        raise HTTPException(status_code=500, detail="OPENPROJECT_API_TOKEN is not configured")

    auth = ("apikey", openproject_api_token)
    payload_wp = {
        "subject": feedback_data.subject,
        "description": {
            "raw": feedback_data.description
            + (
                "\n\n**Eklenen Dosyalar:**\n"
                + "\n".join([f"- {url}" for url in (feedback_data.attachments or [])])
                if feedback_data.attachments
                else ""
            )
        },
        f"customField{platform_field_id}": feedback_data.platform,
        f"customField{talep_sahibi_field_id}": feedback_data.talep_sahibi,
        f"customField{birim_field_id}": feedback_data.birim,
        "_links": {
            "type": {"href": f"/api/v3/types/{type_id}"},
            "project": {"href": f"/api/v3/projects/{openproject_project_id}"},
        },
        "_meta": {"validateCustomFields": True},
    }

    async with httpx.AsyncClient(timeout=30.0, verify=verify_ssl) as client:
        try:
            wp_resp = await client.post(
                f"{openproject_url}/api/v3/work_packages",
                headers={"Content-Type": "application/json"},
                json=payload_wp,
                auth=auth,
            )
        except httpx.RequestError as exc:
            raise HTTPException(status_code=500, detail=f"OpenProject connection failed: {exc}") from exc

        if wp_resp.status_code not in (200, 201):
            raise HTTPException(status_code=500, detail=f"OpenProject error: {wp_resp.status_code} {wp_resp.text[:300]}")

        wp_data = wp_resp.json()
        wp_id = wp_data.get("id")
        if not wp_id:
            raise HTTPException(status_code=500, detail="OpenProject did not return work package ID")

        board_payload = {"delta": {str(wp_id): "-1234435"}}
        try:
            await client.patch(
                f"{openproject_url}/api/v3/queries/{openproject_column_query_id}/order",
                headers={"Content-Type": "application/json"},
                json=board_payload,
                auth=auth,
            )
        except httpx.RequestError:
            # Board update is optional; keep success if work package exists.
            pass

        return FeedbackResponse(success=True, message="Geri bildirim başarıyla gönderildi.", work_package_id=wp_id)


@app.post("/api/v1/feedback/upload-file")
async def upload_file(file: UploadFile = File(...)) -> dict:
    if not (POCKETBASE_URL and POCKETBASE_SAVE_URL and POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD):
        raise HTTPException(status_code=500, detail="PocketBase upload settings are not fully configured")

    async with httpx.AsyncClient(timeout=30.0, verify=OPENPROJECT_VERIFY_SSL) as client:
        auth_response = await client.post(
            f"{POCKETBASE_URL}/api/admins/auth-with-password",
            json={"identity": POCKETBASE_ADMIN_EMAIL, "password": POCKETBASE_ADMIN_PASSWORD},
        )
        if auth_response.status_code != 200:
            raise HTTPException(status_code=500, detail=f"PocketBase auth failed: {auth_response.text[:300]}")

        token = auth_response.json().get("token")
        if not token:
            raise HTTPException(status_code=500, detail="PocketBase token could not be obtained")

        content = await file.read()
        upload_response = await client.post(
            f"{POCKETBASE_URL}/api/collections/files/records",
            files={"document": (file.filename, content, file.content_type or "application/octet-stream")},
            headers={"Authorization": token},
        )
        if upload_response.status_code not in (200, 201):
            raise HTTPException(status_code=500, detail=f"PocketBase upload failed: {upload_response.text[:300]}")

        data = upload_response.json()
        file_url = f"{POCKETBASE_SAVE_URL}/api/files/files/{data['id']}/{data['document']}"
        return {"url": file_url, "record_id": data["id"], "filename": data["document"]}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)

