FROM python:3.12-slim-bookworm

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV FLASK_APP=run.py
ENV PYTHONUNBUFFERED=1
ENV PORT=5000

EXPOSE 5000

# Single worker: APScheduler must run in only one process.
ENTRYPOINT ["sh", "-c", "flask init-db && exec gunicorn -w 1 -b 0.0.0.0:${PORT:-5000} --timeout 120 run:app"]
