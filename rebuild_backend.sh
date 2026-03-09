#!/bin/bash
# Script to rebuild and restart the dtbackend container

echo "Stopping dtbackend container..."
docker-compose stop dtbackend

echo "Removing dtbackend container..."
docker-compose rm -f dtbackend

echo "Rebuilding dtbackend image..."
docker-compose build --no-cache dtbackend

echo "Starting dtbackend container..."
docker-compose up -d dtbackend

echo "Showing logs (Ctrl+C to exit)..."
docker-compose logs -f dtbackend
