FROM python:3.11-bookworm

WORKDIR /app

# Copy requirements first for better caching
COPY dtbackend/requirements.txt .

COPY dtbackend/public .
# Install system dependencies and Microsoft ODBC Driver 17 for SQL Server
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gnupg2 \
    unixodbc \
    unixodbc-dev \
    && curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/debian/12/prod bookworm main" > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y --no-install-recommends msodbcsql17 \
    && rm -rf /var/lib/apt/lists/*

# Set ODBC environment variables
ENV ODBCSYSINI=/etc
ENV ODBCINI=/etc/odbc.ini

# RUN pip install --no-cache-dir \
#     -i http://ftp.company.com.tr/simple/ \
#     --index-url http://ftp.company.com.tr/simple/ \
#     --trusted-host ftp.company.com.tr \
#     -r requirements.txt

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY dtbackend .

# Expose port
EXPOSE 3000

# Run alembic migrations and then start the application
CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 3000 --reload"]
