FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
# RUN pip install --no-cache-dir \
#     -i http://ftp.company.com.tr/simple/ \
#     --index-url http://ftp.company.com.tr/simple/ \
#     --trusted-host ftp.company.com.tr \
#     -r requirements.txt

RUN pip install --no-cache-dir -r requirements.txt
COPY transfer.py .

CMD ["python", "transfer.py"]