@echo off
setlocal EnableDelayedExpansion

:: Ancient Script Decipherment Copilot — Stop Server (Windows)
:: Finds all PIDs listening on port 7340 and force-kills them

echo ============================================
echo  Ancient Script Decipherment Copilot
echo  Stopping server on port 7340...
echo ============================================

set FOUND=0

for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":7340.*LISTENING"') do (
    echo [OK] Killing process PID: %%a
    taskkill /F /PID %%a >nul 2>&1
    set FOUND=1
)

if "!FOUND!"=="0" (
    echo [INFO] No server found running on port 7340.
) else (
    echo [OK] Server stopped.
)

exit /b 0
