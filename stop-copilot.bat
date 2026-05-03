@echo off
setlocal

set PORT=7340
set FOUND=0

echo.
echo  Stopping Ancient Script Decipherment Copilot ^(port %PORT%^)...
echo.

:: Find all PIDs listening on port 7340
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
    set PID=%%a
    set FOUND=1
    echo  Found PID: %%a
    taskkill /PID %%a /F >nul 2>&1
    if errorlevel 1 (
        echo  [ERROR] Could not kill PID %%a — try running as Administrator.
    ) else (
        echo  [OK]    PID %%a stopped.
    )
)

if "%FOUND%"=="0" (
    echo  [INFO] No process found listening on port %PORT%.
    echo         Copilot is not running.
)

echo.
endlocal
