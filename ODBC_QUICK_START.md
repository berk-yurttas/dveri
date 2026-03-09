# ODBC Driver Installation Guide

## Quick Start

### Environment WITH Internet Access

Just build normally:
```bash
docker-compose build dtbackend
docker-compose up -d dtbackend
```

The current `Dockerfile` is configured for online environments.

### Environment WITHOUT Internet Access

#### 1. On a machine with internet, download packages:
```bash
chmod +x download_odbc_packages.sh
./download_odbc_packages.sh
```

#### 2. Transfer to offline environment:
```bash
scp -r offline_packages/ user@offline-server:/path/to/dt_report/
```

#### 3. On offline server, switch Dockerfile:
```bash
cp dtbackend/Dockerfile.offline dtbackend/Dockerfile
```

#### 4. Build:
```bash
docker-compose build --no-cache dtbackend
docker-compose up -d dtbackend
```

## Files Created

- `dtbackend/Dockerfile` - Default (online version)
- `dtbackend/Dockerfile.online` - For environments with internet
- `dtbackend/Dockerfile.offline` - For air-gapped environments
- `download_odbc_packages.sh` - Helper script to download .deb packages
- `offline_packages/` - Downloaded packages (not committed to git)
- `ODBC_OFFLINE_INSTALL.md` - Detailed instructions

## Troubleshooting

### Verify ODBC driver is installed in container:
```bash
docker exec -it dtbackend bash
odbcinst -q -d
```

Should show: `[ODBC Driver 17 for SQL Server]`

### Check environment variables:
```bash
docker exec -it dtbackend bash
echo $ODBCSYSINI
echo $ODBCINI
```

Should show:
- ODBCSYSINI: `/etc`
- ODBCINI: `/etc/odbc.ini`

### Test connection manually:
```bash
docker exec -it dtbackend python test_odbc_connection.py
```
