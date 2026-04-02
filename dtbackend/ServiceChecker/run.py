import os

from app import create_app, db

app = create_app()


@app.cli.command("init-db")
def init_db():
    """Create database tables."""
    db.create_all()
    print("Tables created.")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
