@echo off
cd /d "%~dp0"
echo Stop the Floorwork application with Ctrl+C in its console first.
echo This stops its database container and preserves the database files.
docker compose stop db
if errorlevel 1 pause
