#!/bin/bash
# Script to download ODBC driver packages for offline installation
# Run this on a machine WITH internet access

set -e

echo "=========================================="
echo "ODBC Driver Package Download Script"
echo "=========================================="

# Create offline packages directory
mkdir -p offline_packages
cd offline_packages

echo ""
echo "[1/3] Downloading ODBC Driver 17 package..."

# Download directly from Microsoft
PACKAGE_URL="https://packages.microsoft.com/debian/12/prod/pool/main/m/msodbcsql17/msodbcsql17_17.10.5.1-1_amd64.deb"
PACKAGE_FILE="msodbcsql17_17.10.5.1-1_amd64.deb"

if [ -f "$PACKAGE_FILE" ]; then
    echo "Package already exists: $PACKAGE_FILE"
    read -p "Download again? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Skipping download..."
    else
        wget -O "$PACKAGE_FILE" "$PACKAGE_URL"
    fi
else
    wget -O "$PACKAGE_FILE" "$PACKAGE_URL"
fi

echo ""
echo "[2/3] Verifying package..."
if [ -f "$PACKAGE_FILE" ]; then
    SIZE=$(du -h "$PACKAGE_FILE" | cut -f1)
    echo "✓ Package downloaded successfully"
    echo "  File: $PACKAGE_FILE"
    echo "  Size: $SIZE"
else
    echo "✗ Download failed!"
    exit 1
fi

echo ""
echo "[3/3] Creating README..."
cat > README.txt << 'EOF'
ODBC Driver Offline Installation Package
==========================================

This directory contains the Microsoft ODBC Driver 17 for SQL Server
package for offline installation in Docker containers.

Files:
- msodbcsql17_17.10.5.1-1_amd64.deb: ODBC Driver 17 package

Instructions:
1. Copy this entire 'offline_packages' directory to your offline environment
2. Place it in the root of your dt_report project
3. Use Dockerfile.offline when building your container

See ../ODBC_OFFLINE_INSTALL.md for detailed instructions.
EOF

echo "✓ README created"

cd ..

echo ""
echo "=========================================="
echo "Download Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Transfer the 'offline_packages' directory to your offline environment:"
echo "   scp -r offline_packages/ user@offline-server:/path/to/dt_report/"
echo ""
echo "2. On the offline server, use Dockerfile.offline:"
echo "   cp dtbackend/Dockerfile.offline dtbackend/Dockerfile"
echo ""
echo "3. Build the container:"
echo "   docker-compose build --no-cache dtbackend"
echo ""
echo "Package location: $(pwd)/offline_packages/"
echo ""
