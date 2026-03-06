#!/usr/bin/env python3
"""
ODBC Driver Diagnostic Script
Run this on your Linux machine to diagnose ODBC driver issues
"""

import sys
import os

print("=" * 60)
print("ODBC Driver Diagnostic Script")
print("=" * 60)

# 1. Check environment variables
print("\n[1] Environment Variables:")
print(f"    ODBCSYSINI: {os.environ.get('ODBCSYSINI', 'NOT SET')}")
print(f"    ODBCINI: {os.environ.get('ODBCINI', 'NOT SET')}")
print(f"    LD_LIBRARY_PATH: {os.environ.get('LD_LIBRARY_PATH', 'NOT SET')}")

# 2. Check if pyodbc is installed
print("\n[2] Checking pyodbc installation:")
try:
    import pyodbc
    print(f"    ✓ pyodbc installed (version: {pyodbc.version})")
except ImportError as e:
    print(f"    ✗ pyodbc not installed: {e}")
    sys.exit(1)

# 3. Check available drivers via pyodbc
print("\n[3] Drivers detected by pyodbc.drivers():")
try:
    drivers = pyodbc.drivers()
    if drivers:
        for driver in drivers:
            print(f"    - {driver}")
    else:
        print("    ✗ No drivers found by pyodbc!")
except Exception as e:
    print(f"    ✗ Error getting drivers: {e}")

# 4. Check odbcinst command
print("\n[4] Checking odbcinst command:")
import subprocess
try:
    result = subprocess.run(['odbcinst', '-q', '-d'], capture_output=True, text=True, check=False)
    if result.returncode == 0:
        print("    odbcinst output:")
        for line in result.stdout.strip().split('\n'):
            print(f"      {line}")
    else:
        print(f"    ✗ odbcinst failed with code {result.returncode}")
        print(f"      stderr: {result.stderr}")
except FileNotFoundError:
    print("    ✗ odbcinst command not found")
except Exception as e:
    print(f"    ✗ Error running odbcinst: {e}")

# 5. Check if driver library exists
print("\n[5] Checking driver library files:")
driver_paths = [
    "/opt/microsoft/msodbcsql17/lib64/libmsodbcsql-17.10.so.6.1",
    "/opt/microsoft/msodbcsql18/lib64/libmsodbcsql-18.3.so.3.1",
]
for path in driver_paths:
    if os.path.exists(path):
        print(f"    ✓ Found: {path}")
    else:
        print(f"    ✗ Not found: {path}")

# 6. Check ODBC configuration files
print("\n[6] Checking ODBC configuration files:")
config_files = [
    "/etc/odbcinst.ini",
    "/etc/odbc.ini",
    "~/.odbcinst.ini",
    "~/.odbc.ini"
]
for config_file in config_files:
    expanded_path = os.path.expanduser(config_file)
    if os.path.exists(expanded_path):
        print(f"    ✓ Found: {config_file}")
        try:
            with open(expanded_path, 'r') as f:
                content = f.read()
                if 'SQL Server' in content:
                    print(f"      Contains SQL Server configuration")
        except Exception as e:
            print(f"      Error reading: {e}")
    else:
        print(f"    ✗ Not found: {config_file}")

# 7. Try to connect with explicit driver name
print("\n[7] Testing connection with explicit driver name:")
test_drivers = [
    'ODBC Driver 17 for SQL Server',
    'ODBC Driver 18 for SQL Server',
]

for driver_name in test_drivers:
    print(f"\n    Testing: {driver_name}")
    try:
        connection_string = (
            f'DRIVER={{{driver_name}}};'
            'SERVER=10.60.139.2,1433;'
            'DATABASE=AFLOW;'
            'UID=sa;'
            'PWD=sapass-1;'
            'Timeout=5;'
        )
        print(f"    Connection string: {connection_string.replace('PWD=sapass-1', 'PWD=***')}")
        conn = pyodbc.connect(connection_string, timeout=5)
        print(f"    ✓ Connection successful!")
        conn.close()
        break
    except pyodbc.Error as e:
        print(f"    ✗ Connection failed: {e}")
    except Exception as e:
        print(f"    ✗ Unexpected error: {e}")

print("\n" + "=" * 60)
print("Diagnostic complete!")
print("=" * 60)

# 8. Recommendations
print("\n[RECOMMENDATIONS]")
sql_drivers = [d for d in pyodbc.drivers() if 'SQL Server' in d]
if not sql_drivers:
    print("""
If pyodbc.drivers() returns empty, try:

1. Set environment variable before running:
   export ODBCSYSINI=/etc
   python main.py

2. Or add to your systemd service file:
   Environment="ODBCSYSINI=/etc"

3. Or set in your .env file and load it in Python:
   os.environ['ODBCSYSINI'] = '/etc'
""")
else:
    print("✓ Drivers detected successfully. Connection should work.")
