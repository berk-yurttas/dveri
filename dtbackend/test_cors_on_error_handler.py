"""Tests that an unhandled exception yields a real 500 *with* CORS headers.

Starlette's ServerErrorMiddleware generates the 500 outside CORSMiddleware, so
without an explicit handler the browser sees a header-less response as an opaque
"Failed to fetch". `unhandled_exception_handler` must attach CORS headers itself.

This builds a minimal app mirroring main.py's middleware + handler registration
(no DB / scheduler import). Run with:
    python -m unittest test_cors_on_error_handler -v
"""
import unittest

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.exception_handlers import unhandled_exception_handler

_allowed = settings.BACKEND_CORS_ORIGINS
ALLOWED_ORIGIN = _allowed[0] if isinstance(_allowed, list) and _allowed else "http://localhost:3000"
DISALLOWED_ORIGIN = "http://evil.example"


def _build_app() -> FastAPI:
    app = FastAPI()
    # Mirror main.py: CORS added last (outermost user middleware).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_exception_handler(Exception, unhandled_exception_handler)

    @app.get("/boom")
    async def boom():
        raise RuntimeError("kaboom")

    return app


class CorsOnErrorTest(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(_build_app(), raise_server_exceptions=False)

    def test_unhandled_error_is_500_with_cors_headers(self):
        r = self.client.get("/boom", headers={"Origin": ALLOWED_ORIGIN})
        self.assertEqual(r.status_code, 500)
        self.assertEqual(r.headers.get("access-control-allow-origin"), ALLOWED_ORIGIN)
        self.assertEqual(r.headers.get("access-control-allow-credentials"), "true")
        self.assertIn("detail", r.json())

    def test_disallowed_origin_gets_no_cors_header(self):
        r = self.client.get("/boom", headers={"Origin": DISALLOWED_ORIGIN})
        self.assertEqual(r.status_code, 500)
        self.assertIsNone(r.headers.get("access-control-allow-origin"))

    def test_no_origin_header_still_500(self):
        r = self.client.get("/boom")
        self.assertEqual(r.status_code, 500)
        self.assertIsNone(r.headers.get("access-control-allow-origin"))


if __name__ == "__main__":
    unittest.main()
