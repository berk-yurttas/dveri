FROM python:3.12-bookworm

WORKDIR /app

# Using full bookworm image instead of slim - includes libpq5 for PostgreSQL
# No apt-get commands needed for prod compatibility

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV FLASK_APP=run.py
ENV PYTHONUNBUFFERED=1
ENV PORT=5000

EXPOSE 5000

# Single worker: APScheduler must run in only one process.
ENTRYPOINT ["sh", "-c", "flask init-db && exec gunicorn -w 1 -b 0.0.0.0:${PORT:-5000} --timeout 120 run:app"]
