@echo off
setlocal

set SERVER_DIR=%~dp0decipher-copilot\server
set LOG_FILE=%~dp0decipher-copilot\logs\server.log

:: Ensure logs directory exists
if not exist "%~dp0decipher-copilot\logs" mkdir "%~dp0decipher-copilot\logs"

:: Check if already running on port 7340
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":7340 " ^| findstr "LISTENING"') do (
    echo [!] Copilot is already running on port 7340 ^(PID %%a^)
    echo     Open: http://127.0.0.1:7340
    goto :end
)

:: Verify Node.js is available
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install from https://nodejs.org
    pause
    goto :end
)

:: Verify server directory and entry point exist
if not exist "%SERVER_DIR%\src\index.js" (
    echo [ERROR] Server not found at: %SERVER_DIR%\src\index.js
    pause
    goto :end
)

:: Verify .env exists
if not exist "%SERVER_DIR%\.env" (
    echo [WARN]  No .env found. Copying .env.example...
    if exist "%SERVER_DIR%\.env.example" (
        copy "%SERVER_DIR%\.env.example" "%SERVER_DIR%\.env" >nul
        echo        .env created from example. Edit it before production use.
    ) else (
        echo [ERROR] No .env or .env.example found.
        pause
        goto :end
    )
)

echo.
echo  Starting Ancient Script Decipherment Copilot...
echo  Log: %LOG_FILE%
echo.

:: Start server in a new window, logging stdout+stderr
start "Ancient Script Copilot" /min cmd /c "cd /d "%SERVER_DIR%" && node --env-file=.env src/index.js >> "%LOG_FILE%" 2>&1"

:: Wait a moment then confirm it came up
timeout /t 3 /nobreak >nul

for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":7340 " ^| findstr "LISTENING"') do (
    echo  [OK] Copilot started ^(PID %%a^)
    echo       UI:  http://127.0.0.1:7340
    echo       Log: %LOG_FILE%
    goto :end
)

echo  [!] Server may still be initializing ^(seeding datasets takes a moment^).
echo      Check log: %LOG_FILE%
echo      UI:        http://127.0.0.1:7340

:end
echo.
endlocal
