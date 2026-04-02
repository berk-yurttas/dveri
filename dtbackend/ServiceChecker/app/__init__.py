import os
from datetime import datetime

from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from config import Config

db = SQLAlchemy()
scheduler = BackgroundScheduler()


def _should_start_scheduler(app: Flask) -> bool:
    # With Flask/Werkzeug reloader, only the child process sets WERKZEUG_RUN_MAIN=true.
    debug = app.config.get("DEBUG", False)
    return (not debug) or os.environ.get("WERKZEUG_RUN_MAIN") == "true"


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)

    from app import models  # noqa: F401
    from app.routes import bp as main_bp

    app.register_blueprint(main_bp)

    def run_scheduled_checks():
        with app.app_context():
            from app.health import check_all_endpoints

            check_all_endpoints()

    if _should_start_scheduler(app) and not scheduler.running:
        scheduler.add_job(
            func=run_scheduled_checks,
            trigger=IntervalTrigger(minutes=app.config["CHECK_INTERVAL_MINUTES"]),
            id="health_check_job",
            replace_existing=True,
            next_run_time=datetime.now()
        )
        scheduler.start()

    @app.teardown_appcontext
    def shutdown_session(exception=None):
        db.session.remove()

    return app
