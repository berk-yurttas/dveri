import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    DEBUG = os.environ.get("FLASK_DEBUG") == "1"
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-change-in-production")
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/servicechecker",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    CHECK_INTERVAL_MINUTES = int(os.environ.get("CHECK_INTERVAL_MINUTES", "5"))
    REQUEST_TIMEOUT_SECONDS = int(os.environ.get("REQUEST_TIMEOUT_SECONDS", "10"))
