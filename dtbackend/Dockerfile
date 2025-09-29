FROM python:3.11-bookworm

WORKDIR /app

# Copy requirements first for better caching
COPY dtbackend/requirements.txt .

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
