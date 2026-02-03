from clickhouse_driver import Client
import os

# Connect to ClickHouse
client = Client(host='localhost', port=9000, user='default', password='ClickHouse@2024')

# Create table
sql = """
CREATE TABLE IF NOT EXISTS default.Analytics_Events (
    timestamp DateTime DEFAULT now(),
    event_type String,
    path String,
    session_id String,
    user_id Nullable(String),
    ip String,
    user_agent String,
    duration UInt32 DEFAULT 0,
    meta String DEFAULT '{}'
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (event_type, timestamp);
"""

try:
    client.execute(sql)
    print("Table Analytics_Events created successfully.")
except Exception as e:
    print(f"Error creating table: {e}")
