# Instructions for Installing ODBC Driver in Offline Environment

## For the Environment WITH Internet Access (Online)

Use the existing `Dockerfile` which automatically downloads and installs the ODBC driver.

## For the Environment WITHOUT Internet Access (Offline)

### Step 1: Download ODBC Driver Packages (on a machine with internet)

On a machine with internet access (Debian/Ubuntu based), download the required packages:

```bash
# Create directory for offline packages
mkdir -p offline_packages
cd offline_packages

# Download Microsoft repository key and list
wget https://packages.microsoft.com/keys/microsoft.asc
wget https://packages.microsoft.com/config/debian/12/prod.list

# Add the repository temporarily
sudo apt-key add microsoft.asc
sudo cp prod.list /etc/apt/sources.list.d/mssql-release.list
sudo apt-get update

# Download the ODBC driver package (without installing)
cd /tmp
apt-get download msodbcsql17

# Move the downloaded .deb file to your offline_packages directory
mv msodbcsql17_*.deb ~/path/to/your/project/offline_packages/
```

### Alternative: Download directly from Microsoft

```bash
mkdir -p offline_packages
cd offline_packages

# For Debian 12 (Bookworm) - ODBC Driver 17
wget https://packages.microsoft.com/debian/12/prod/pool/main/m/msodbcsql17/msodbcsql17_17.10.5.1-1_amd64.deb
```

### Step 2: Transfer Files to Offline Environment

Copy the entire `offline_packages/` directory to your offline environment:

```bash
# Example using scp
scp -r offline_packages/ user@offline-server:/path/to/dt_report/
```

### Step 3: Update Dockerfile in Offline Environment

Rename the appropriate Dockerfile:

**For Online Environment:**
```bash
cp dtbackend/Dockerfile.online dtbackend/Dockerfile
```

**For Offline Environment:**
```bash
cp dtbackend/Dockerfile.offline dtbackend/Dockerfile
```

### Step 4: Build the Docker Image

```bash
# In offline environment
docker-compose build --no-cache dtbackend
docker-compose up -d dtbackend
```

## Folder Structure

```
dt_report/
├── offline_packages/
│   └── msodbcsql17_17.10.5.1-1_amd64.deb
├── dtbackend/
│   ├── Dockerfile (copy from Dockerfile.online or Dockerfile.offline)
│   ├── Dockerfile.online
│   └── Dockerfile.offline
└── docker-compose.yml
```

## Testing

After building, verify the driver is installed:

```bash
# Enter the container
docker exec -it dtbackend bash

# Check installed drivers
odbcinst -q -d

# Should show:
# [ODBC Driver 17 for SQL Server]
```

## Notes

- The `.deb` file is approximately 800KB-1MB in size
- Make sure you download the correct architecture (usually amd64)
- The driver version in the filename may vary (e.g., 17.10.5.1, 17.10.6.1)
- For Python packages, you're already using the internal company mirror (ftp.company.com.tr)
