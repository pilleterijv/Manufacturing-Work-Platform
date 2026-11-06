@echo off
cd /d "%~dp0"
if not exist ".floorwork\runtime\tools\create-admin.cjs" (
  echo Run START-FLOORWORK.cmd first to prepare the application.
  pause
  exit /b 1
)
node --env-file=.env .floorwork\runtime\tools\create-admin.cjs
if errorlevel 1 pause
