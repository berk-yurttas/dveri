"""
Standalone assertion test for is_full_admin.

Run with: python dtbackend/test_full_admin_helper.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from app.api.v1.endpoints.romiot.station.auth import is_full_admin
from app.schemas.user import User


def make_user(role):
    # Use model_construct to bypass list[str] validation so we can also exercise
    # the helper with role=None (defensive branch).
    return User.model_construct(
        id="u1",
        username="u",
        email="u@x",
        name="U",
        company="C",
        department="C",
        management_dpt="",
        title="",
        role=role,
        verified=True,
    )


def main():
    assert is_full_admin(make_user(["fullAdmin:true"])) is True, "lone fullAdmin"
    assert is_full_admin(make_user(["atolye:yonetici", "fullAdmin:true"])) is True, "with other roles"
    assert is_full_admin(make_user(["atolye:yonetici"])) is False, "no fullAdmin"
    assert is_full_admin(make_user([])) is False, "empty list"
    assert is_full_admin(make_user(None)) is False, "None role"  # type: ignore[arg-type]
    assert is_full_admin(make_user(["fullAdmin:false"])) is False, "fullAdmin false literal"
    assert is_full_admin(make_user(["fulladmin:true"])) is False, "case sensitive"
    print("is_full_admin: OK")


if __name__ == "__main__":
    main()
