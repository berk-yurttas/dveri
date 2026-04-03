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
            
            app.logger.info("Running scheduled health checks...")
            try:
                count = check_all_endpoints()
                app.logger.info(f"Scheduled check completed: {count} endpoints checked")
            except Exception as e:
                app.logger.error(f"Error during scheduled checks: {e}", exc_info=True)

    if _should_start_scheduler(app) and not scheduler.running:
        # Configure scheduler with better misfire handling
        scheduler.configure(
            job_defaults={
                'coalesce': True,  # Combine multiple missed runs into one
                'max_instances': 1,  # Only one instance of the job at a time
                'misfire_grace_time': 30  # Allow 30 seconds grace for missed schedules
            }
        )
        
        scheduler.add_job(
            func=run_scheduled_checks,
            trigger=IntervalTrigger(minutes=app.config["CHECK_INTERVAL_MINUTES"]),
            id="health_check_job",
            replace_existing=True,
            next_run_time=datetime.now()
        )
        scheduler.start()
        app.logger.info(
            f"Health check scheduler started with {app.config['CHECK_INTERVAL_MINUTES']}-minute interval"
        )

    @app.teardown_appcontext
    def shutdown_session(exception=None):
        db.session.remove()

    return app
